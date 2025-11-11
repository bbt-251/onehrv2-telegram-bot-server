import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { ShiftTypeModel, ShiftHourModel } from "../models/hrSettings";

dayjs.extend(duration);

export const days: string[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

function calculateDailyWorkingHours(
    currentDay: dayjs.Dayjs,
    shiftType: ShiftTypeModel,
    shiftHours: ShiftHourModel[],
    employeeTimezone?: string | null
): number {
    let totalHours = 0;

    const tz = employeeTimezone || 'Africa/Nairobi';
    const dayOfTheWeek = days[currentDay.tz(tz).day()];
    const workingDay = shiftType?.workingDays?.find(
        (day) => day.dayOfTheWeek === dayOfTheWeek
    );

    if (workingDay) {
        const shiftHour = shiftHours.find(
            (sh) => sh.id === workingDay.associatedShiftHour
        );
        if (shiftHour) {
            shiftHour.shiftHours.forEach((shift) => {
                const startTime = dayjs(shift.startTime, "hh:mm A");
                let endTime = dayjs(shift.endTime, "hh:mm A");

                // If end time is before start time, add a day to end time
                if (endTime.isBefore(startTime)) {
                    endTime = endTime.add(1, "day");
                }

                const diffInMs = endTime.diff(startTime);
                const dur = dayjs.duration(diffInMs);

                totalHours += dur.asHours();
            });
        }
    }

    return totalHours;
}

export default calculateDailyWorkingHours;