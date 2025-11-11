import dayjs from 'dayjs';
import { sendMessage } from '../bot';
import { getHealthyDbInstances, retryDatabaseOperation } from '../firebase-config';
import { AttendanceModel, WorkedHoursModel, DailyAttendance } from '../models/attendance';
import { EmployeeModel } from '../models/employee';
import getEmployeeFullName from '../util/getEmployeeFullName';
import { validateEmployeeLocationAndArea } from '../util/locationValidation';
import { formatHour } from '../util/dayjs_format';
import type { firestore } from 'firebase-admin';

interface ClockedInEmployee {
    employee: EmployeeModel;
    attendance: AttendanceModel;
    projectName: string;
}

interface AutoClockOutResult {
    success: boolean;
    employeeId: string;
    employeeName: string;
    employeeChatID: string | null;
    managerChatID: string | null;
    error?: string | null;
    reason?: string | null;
}

export class LocationMonitoringService {
    private intervalId?: NodeJS.Timeout | null;
    private isRunning = false;

    // Configuration with validation
    // private readonly CHECK_INTERVAL_MINUTES = Math.max(1, Math.min(60, parseInt(process.env.LOCATION_CHECK_INTERVAL_MINUTES || '10')));
    // private readonly MAX_LOCATION_AGE_MINUTES = Math.max(5, Math.min(120, parseInt(process.env.LOCATION_MAX_AGE_MINUTES || '30')));
    // private readonly FEATURE_ENABLED = process.env.LOCATION_AUTO_CLOCK_OUT_ENABLED !== 'false';
    // private readonly NOTIFICATION_ENABLED = process.env.LOCATION_NOTIFICATIONS_ENABLED !== 'false';
    private readonly CHECK_INTERVAL_MINUTES = 5;
    private readonly MAX_LOCATION_AGE_MINUTES = 10;
    private readonly FEATURE_ENABLED = true;
    private readonly NOTIFICATION_ENABLED = true;
    // private readonly DRY_RUN_MODE = true; // Don't actually perform clock outs

    startMonitoring(): void {
        if (this.isRunning) {
            console.log('Location monitoring already running');
            return;
        }

        if (!this.FEATURE_ENABLED) {
            console.log('Location auto clock-out feature is disabled');
            return;
        }

        console.log(`Starting location monitoring service (check every ${this.CHECK_INTERVAL_MINUTES} minutes, max location age: ${this.MAX_LOCATION_AGE_MINUTES} minutes, notifications: ${this.NOTIFICATION_ENABLED ? 'enabled' : 'disabled'})`);
        this.isRunning = true;

        // Run initial check after a short delay to allow system to stabilize
        setTimeout(() => {
            this.runLocationCheck();
        }, 30000); // 30 seconds delay

        // Schedule periodic checks
        this.intervalId = setInterval(() => {
            this.runLocationCheck();
        }, this.CHECK_INTERVAL_MINUTES * 60 * 1000);
    }

    stopMonitoring(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('Location monitoring service stopped');
    }

    isMonitoring(): boolean {
        return this.isRunning;
    }

    private async runLocationCheck(): Promise<void> {
        try {
            console.log('🔍 Running location monitoring check...');

            // Get healthy databases once for this entire check cycle
            const healthyDbs = await getHealthyDbInstances();

            const clockedInEmployees = await this.findClockedInEmployees(healthyDbs);

            if (clockedInEmployees.length === 0) {
                console.log('No employees currently clocked in');
                return;
            }

            console.log(`********** Found ${clockedInEmployees.length} clocked-in employees **********`);

            const autoClockOutResults: AutoClockOutResult[] = [];

            for (const { employee, attendance, projectName } of clockedInEmployees) {
                try {
                    const result = await this.checkAndAutoClockOut(employee, attendance, projectName, healthyDbs);
                    if (result) {
                        autoClockOutResults.push(result);
                    }
                } catch (error) {
                    console.error(`Error checking employee ${employee.uid}:`, error);
                }
            }

            // Send notifications for successful auto clock-outs
            for (const result of autoClockOutResults) {
                await this.sendNotifications(result);
            }

            console.log(`Location monitoring check completed. Auto clocked out: ${autoClockOutResults.length} employees`);
        } catch (error) {
            console.error('Error in location monitoring check:', error);
        }
    }

    private async findClockedInEmployees(healthyDbs: Record<string, firestore.Firestore>): Promise<ClockedInEmployee[]> {
        const clockedInEmployees: ClockedInEmployee[] = [];

        for (const [projectName, db] of Object.entries(healthyDbs)) {
            try {
                // Find attendance records with lastClockInTimestamp set (indicating currently clocked in)
                const attendanceRef = db.collection('attendance');

                // Fetch all attendance records for current month and filter client-side
                // This avoids needing composite indexes on multiple fields across many databases
                const attendanceQuery = await retryDatabaseOperation(async () => {
                    return await attendanceRef
                        .where('year', '==', dayjs.utc().year())
                        .where('month', '==', dayjs.utc().format('MMMM') as "January" | "February" | "March" | "April" | "May" | "June" | "July" | "August" | "September" | "October" | "November" | "December")
                        .get();
                }, 2, 1000, projectName);

                // Filter client-side for currently clocked-in employees
                const clockedInDocs = attendanceQuery.docs.filter(doc => {
                    const data = doc.data();
                    return data.lastClockInTimestamp !== null && data.lastClockInTimestamp !== undefined;
                });

                for (const attendanceDoc of clockedInDocs) {
                    const attendance = attendanceDoc.data() as AttendanceModel;
                    attendance.id = attendanceDoc.id;

                    // Get employee data
                    const employeesRef = db.collection('employee');
                    const employeeDoc = await retryDatabaseOperation(async () => {
                        return await employeesRef
                            .where('uid', '==', attendance.uid)
                            .limit(1)
                            .get();
                    }, 2, 1000, projectName);

                    if (!employeeDoc.empty) {
                        const doc = employeeDoc.docs[0];
                        if (doc && doc.exists) {
                            const employee = { id: doc.id, uid: doc.data().uid, ...doc.data() } as EmployeeModel;
                            clockedInEmployees.push({
                                employee,
                                attendance,
                                projectName
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error querying attendance in ${projectName}:`, error);
                continue;
            }
        }

        return clockedInEmployees;
    }

    private async checkAndAutoClockOut(
        employee: EmployeeModel,
        attendance: AttendanceModel,
        projectName: string,
        healthyDbs: Record<string, firestore.Firestore>
    ): Promise<AutoClockOutResult | null> {
        // Skip if employee has no working area defined
        if (!employee.workingArea || employee.workingArea.trim() === '') {
            console.log(`Skipping auto clock-out for ${employee.uid}: no working area defined`);
            return null;
        }

        // Validate location and working area
        const validation = validateEmployeeLocationAndArea(
            employee.currentLocation,
            employee.workingArea,
            this.MAX_LOCATION_AGE_MINUTES,
            employee.timezone
        );

        console.log(`   - Location validation result:`, {
            isValid: validation.isValid,
            error: validation.error,
            isLive: validation.isLive,
            coordinates: validation.coordinates,
            locationAge: validation.locationAge
        });

        if (validation.isValid) {
            // Employee is within working area, no action needed
            console.log(`   - Employee is within working area - no action needed`);
            return null;
        }

        // Decide whether this validation failure should trigger an auto clock-out
        // Trigger conditions:
        //  - outside your designated working area (live location)
        //  - location sharing is not active (not live)
        //  - location sharing has ended
        //  - location data is too old
        //
        // Do NOT trigger when there's literally no location data at all (validation.error is "No location data available...")
        const triggerErrors = [
            'outside your designated working area',
            'Location sharing is not active',
            'Location sharing has ended',
            'Location data is too old'
        ];
        if (!validation.error || !triggerErrors.some(err => validation.error!.includes(err))) {
            // Validation failed for a non-trigger reason (e.g., malformed working area, no location)
            console.log(`Skipping auto clock-out for ${employee.uid}: ${validation.error}`);
            return null;
        }

        // Check if employee was recently auto clocked out (prevent spam)
        const lastClockOut = attendance.values[dayjs.utc(attendance.lastClockInTimestamp).date() - 1]?.workedHours
            .filter(wh => wh.type === 'Clock Out')
            .sort((a, b) => dayjs.utc(b.timestamp).diff(dayjs.utc(a.timestamp)))[0];

        if (lastClockOut) {
            const minutesSinceLastClockOut = dayjs.utc().diff(dayjs.utc(lastClockOut.timestamp), 'minute');
            if (minutesSinceLastClockOut < this.CHECK_INTERVAL_MINUTES) {
                console.log(`Skipping auto clock-out for ${employee.uid}: recently clocked out (${minutesSinceLastClockOut} minutes ago)`);
                return null;
            }
        }

        // if (this.DRY_RUN_MODE) {
        //     console.log(`   - DRY RUN: Simulating auto clock-out (no database changes)`);
        //     const result = {
        //         success: true,
        //         employeeId: employee.uid,
        //         employeeName: getEmployeeFullName(employee),
        //         employeeChatID: employee.telegramChatID,
        //         managerChatID: null,
        //         error: null,
        //         reason: validation.error ?? 'Outside working area'
        //     };
        //     return result;
        // }

        const clockOutResult = await this.performAutoClockOut(attendance, projectName, healthyDbs, employee.timezone);

        if (!clockOutResult.success) {
            return {
                success: false,
                employeeId: employee.uid,
                employeeName: getEmployeeFullName(employee),
                employeeChatID: employee.telegramChatID,
                managerChatID: null,
                error: clockOutResult.error || null
            };
        }

        // Find manager's telegram chat ID
        let managerChatID: string | null = null;
        if (employee.reportingLineManager) {
            managerChatID = await this.findManagerChatID(employee.reportingLineManager, projectName, healthyDbs) || null;
        }

        return {
            success: true,
            employeeId: employee.uid,
            employeeName: getEmployeeFullName(employee),
            employeeChatID: employee.telegramChatID,
            managerChatID,
            reason: validation.error ?? 'Outside working area'
        };
    }

    private async performAutoClockOut(attendance: AttendanceModel, projectName: string, healthyDbs: Record<string, firestore.Firestore>, employeeTimezone?: string | null): Promise<{ success: boolean; error?: string }> {
        const db = healthyDbs[projectName];
        if (!db) {
            return { success: false, error: 'Database not available' };
        }

        try {
            const clockInDate = dayjs.utc(attendance.lastClockInTimestamp);
            const clockOutTimestamp = dayjs.utc().toISOString();
            const clockInDayIndex = clockInDate.date() - 1;
 
            // Calculate hours worked
            const hoursWorked = dayjs.utc().diff(dayjs.utc(attendance.lastClockInTimestamp), 'hours', true);
 
            // Normalize to an array to avoid converting to a map/object when updating Firestore
            const baseValues: DailyAttendance[] = Array.isArray(attendance.values)
                ? [...attendance.values]
                : this.normalizeAttendanceValues(attendance.values);
 
            // Clone existing worked hours for the day (if any)
            const workedHours: WorkedHoursModel[] = baseValues[clockInDayIndex]?.workedHours
                ? [...baseValues[clockInDayIndex]!.workedHours]
                : [];
 
            // Add clock-out entry
            const clockOutEntry: WorkedHoursModel = {
                id: crypto.randomUUID(),
                timestamp: clockOutTimestamp,
                type: 'Clock Out',
                hour: formatHour(clockOutTimestamp, employeeTimezone || undefined)
            };
            workedHours.push(clockOutEntry);
 
            // Update daily and monthly worked hours
            const dailyWorkedHours = (baseValues[clockInDayIndex]?.dailyWorkedHours || 0) + hoursWorked;
            const monthlyWorkedHours = attendance.monthlyWorkedHours + hoursWorked;
 
            // Build updated day entry (initialize when missing)
            const updatedDay: DailyAttendance = {
                ...(baseValues[clockInDayIndex] || {
                    id: crypto.randomUUID(),
                    day: clockInDayIndex + 1,
                    value: null,
                    timestamp: clockOutTimestamp,
                    from: null,
                    to: null,
                    status: 'N/A' as const,
                    dailyWorkedHours: 0,
                    workedHours: []
                }),
                workedHours,
                dailyWorkedHours,
                value: 'A', // Mark as absent due to auto clock-out
                status: 'Submitted',
                timestamp: clockOutTimestamp
            };
 
            // Keep values as an array
            baseValues[clockInDayIndex] = updatedDay;
 
            // Update attendance record
            const updateData = {
                values: baseValues,
                monthlyWorkedHours,
                lastClockInTimestamp: null, // Clear clock-in timestamp
                lastChanged: dayjs.utc().toISOString()
            };
 
            await retryDatabaseOperation(async () => {
                return await db.collection('attendance').doc(attendance.id).update(updateData);
            }, 2, 1000, projectName);
 
            return { success: true };
        } catch (error) {
            console.error('Error performing auto clock-out:', error);
            return { success: false, error: 'Failed to update attendance record' };
        }
    }

    private normalizeAttendanceValues(raw: unknown): DailyAttendance[] {
        // If it's already an array, return as-is
        if (Array.isArray(raw)) {
            return raw as DailyAttendance[];
        }
        // Convert map-like object with numeric keys to array, preserving indices
        const arr: DailyAttendance[] = [];
        if (raw && typeof raw === 'object') {
            const entries = Object.entries(raw as Record<string, unknown>);
            for (const [k, v] of entries) {
                const idx = parseInt(k, 10);
                if (!Number.isNaN(idx) && idx >= 0 && idx < 31) {
                    arr[idx] = v as DailyAttendance;
                }
            }
        }
        return arr;
    }
 
    private async findManagerChatID(managerUid: string, projectName: string, healthyDbs: Record<string, firestore.Firestore>): Promise<string | undefined> {
        try {
            const db = healthyDbs[projectName];
            if (!db) return undefined;

            const managerDoc = await retryDatabaseOperation(async () => {
                return await db.collection('employee')
                    .where('uid', '==', managerUid)
                    .limit(1)
                    .get();
            }, 2, 1000, projectName);

            if (!managerDoc.empty) {
                const doc = managerDoc.docs[0];
                if (doc && doc.exists) {
                    const manager = { id: doc.id, uid: doc.data().uid, ...doc.data() } as EmployeeModel;
                    return manager.telegramChatID || undefined;
                }
            }
        } catch (error) {
            console.error('Error finding manager chat ID:', error);
        }
        return undefined;
    }

    private async sendNotifications(result: AutoClockOutResult): Promise<void> {
        if (!this.NOTIFICATION_ENABLED) {
            return;
        }

        try {
            // Notify employee
            if (result.success) {
                // Find employee's telegram chat ID - we need to pass the correct project
                // For now, we'll search across all projects (inefficient but works)
                const reasonText = result.reason ?? 'you are outside your designated working area';
                if (result.employeeChatID) {
                    await sendMessage(
                        parseInt(result.employeeChatID),
                        `⚠️ You have been automatically clocked out because ${reasonText}.`
                    );
                }
            }

            // Notify manager
            if (result.managerChatID) {
                const managerReasonText = result.reason ?? 'being outside the working area';
                await sendMessage(
                    parseInt(result.managerChatID),
                    `👤 Employee ${result.employeeName} has been automatically clocked out due to ${managerReasonText}.`
                );
            }
        } catch (error) {
            console.error('Error sending notifications:', error);
        }
    }
}

// Export singleton instance
export const locationMonitoringService = new LocationMonitoringService();