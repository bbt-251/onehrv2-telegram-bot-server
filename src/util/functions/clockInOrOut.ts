import dayjs from "dayjs";
import { AttendanceModel, WorkedHoursModel } from "../../models/attendance";
import { AttendanceLogicModel } from "../../models/attendance-logic";
import { ShiftTypeModel, ShiftHourModel } from "../../models/hrSettings";
import calculateDailyWorkingHours from "../calculateDailyWorkingHours";
import { updateAttendance } from "./attendance/attendance-service";
import { formatHour } from "../dayjs_format";

export const clockInOrOut = async (
    type: "Clock In" | "Clock Out",
    attendance: AttendanceModel,
    shiftType: ShiftTypeModel,
    attendanceLogic: AttendanceLogicModel,
    shiftHours: ShiftHourModel[],
    project: string,
    employeeTimezone?: string | null,
): Promise<{ status: boolean, error?: string }> => {
    const selected = attendance;
    const newData: AttendanceModel = { ...selected };

    // Calculate daily working hours for the current day
    const dailyWorkingHour: number = calculateDailyWorkingHours(
        dayjs.utc(),
        shiftType,
        shiftHours
    );

    if (dailyWorkingHour === 0) {
        return {
            status: false,
            error: "Set up shift type and associate to employee",
        };
    }

    // Determine the current day's index in the `values` array (zero-based)
    const currentDayIndex = type === 'Clock In' ? dayjs.utc().date() - 1 : dayjs.utc(newData.lastClockInTimestamp).date() - 1;

    // Get the existing worked hours for the day, or initialize an empty array
    const workedHours: WorkedHoursModel[] =
        newData.values[currentDayIndex]?.workedHours ?? [];

    if (type === "Clock In") {
        // Save clock-in timestamp
        const clockInTimestamp = dayjs.utc().toISOString();

        // Initialize daily attendance if it doesn't exist
        if (!newData.values[currentDayIndex]) {
            newData.values[currentDayIndex] = {
                id: crypto.randomUUID(),
                day: currentDayIndex + 1,
                value: null,
                timestamp: clockInTimestamp,
                from: null,
                to: null,
                status: "N/A",
                dailyWorkedHours: 0,
                workedHours: [],
            };
        }

        // Add the clock-in entry to the worked hours array
        workedHours.push({
            id: crypto.randomUUID(),
            timestamp: clockInTimestamp,
            type: "Clock In",
            hour: formatHour(clockInTimestamp, employeeTimezone || undefined),
        });

        // Update the current day's worked hours with the clock-in entry
        newData.values[currentDayIndex].workedHours = workedHours;

        // Save the clock-in timestamp for later reference
        newData.lastClockInTimestamp = clockInTimestamp;
    } else if (type === "Clock Out") {
        // Ensure there is a previous clock-in timestamp
        if (!newData.lastClockInTimestamp) {
            return { status: false, error: "Cannot clock out without a previous clock-in." }
        }

        // Use the clock-in timestamp to determine the working day
        const clockInDate = dayjs.utc(newData.lastClockInTimestamp);
        const clockOutTimestamp = dayjs.utc().toISOString();

        // Determine the day index based on the clock-in date
        const clockInDayIndex = clockInDate.date() - 1;

        // Initialize daily attendance if it doesn't exist
        if (!newData.values[clockInDayIndex]) {
            newData.values[clockInDayIndex] = {
                id: crypto.randomUUID(),
                day: clockInDayIndex + 1,
                value: null,
                timestamp: clockOutTimestamp,
                from: null,
                to: null,
                status: "N/A",
                dailyWorkedHours: 0,
                workedHours: [],
            };
        }

        // Calculate the hours worked since the last clock-in
        const hoursWorked = dayjs.utc().diff(
            dayjs.utc(newData.lastClockInTimestamp),
            "hours",
            true
        );

        // Add the clock-out entry to the worked hours array
        workedHours.push({
            id: crypto.randomUUID(),
            timestamp: clockOutTimestamp,
            type: "Clock Out",
            hour: formatHour(clockOutTimestamp, employeeTimezone || undefined),
        });

        // Update daily and monthly worked hours
        let dailyWorkedHours =
            newData.values[clockInDayIndex]?.dailyWorkedHours ?? 0;
        dailyWorkedHours += hoursWorked;

        let monthlyWorkedHours = newData?.monthlyWorkedHours ?? 0;
        monthlyWorkedHours += hoursWorked;

        // Determine attendance value based on daily worked hours and contract hours
        const attendanceValue = dailyWorkingHour
            ? dailyWorkedHours >=
                dailyWorkingHour *
                (attendanceLogic.presentThreshold
                    ? attendanceLogic.presentThreshold / 100
                    : 0)
                ? "P"
                : dailyWorkedHours >=
                    dailyWorkingHour *
                    (attendanceLogic.halfPresentThreshold
                        ? attendanceLogic.halfPresentThreshold / 100
                        : 0)
                    ? "H"
                    : "A"
            : newData.values[clockInDayIndex]?.value;

        // Update attendance data for the clock-in date
        newData.monthlyWorkedHours = monthlyWorkedHours;
        newData.values[clockInDayIndex] = {
            ...newData.values[clockInDayIndex],
            workedHours,
            value: attendanceValue || null,
            dailyWorkedHours,
            status: "Submitted",
            timestamp: clockOutTimestamp,
        };

        // Reset the clock-in timestamp to null after clock-out
        newData.lastClockInTimestamp = null;
    }

    // Save the updated attendance record in the database
    try {
        await updateAttendance(newData, project);
        return { status: true };
    } catch (error) {
        return { status: false, error: "Failed to update attendance record" + " " + error };
    }
};