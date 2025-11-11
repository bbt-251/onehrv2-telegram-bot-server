import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
// Removed default timezone setting to use UTC for storage
export const DEFAULT_TZ: string = process.env.DEFAULT_TZ || 'Africa/Nairobi';

export const dateFormat: string = "MMMM DD, YYYY";
export const timestampFormat: string = "MMMM DD, YYYY hh:mm A";

export const monthNames: string[] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
export const getCurrentMonthName = () => monthNames[dayjs.tz().month()];

// UTC timestamp functions for storage
export const getUTCTimestamp = () => dayjs.utc().toISOString();
export const getUTCDate = () => dayjs.utc().format(dateFormat);

// Legacy functions - now use Nairobi timezone for display only
export const getTimestamp = () => dayjs.tz().format(timestampFormat);
export const getDate = () => dayjs.tz().format(dateFormat);

export const formatDate = (date: Date | string | dayjs.Dayjs, tz?: string) => dayjs.utc(date).tz(tz || DEFAULT_TZ).format(dateFormat);
export const formatTimestamp = (timestamp: Date | string | dayjs.Dayjs, tz?: string) => dayjs.utc(timestamp).tz(tz || DEFAULT_TZ).format(timestampFormat);
export const formatHour = (d: Date | string | dayjs.Dayjs, tz?: string) => dayjs.utc(d).tz(tz || DEFAULT_TZ).format('h:mm A');
