export const BEIJING_TIME_ZONE = "Asia/Shanghai";

function timestampParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = valueOf("year");
  const month = valueOf("month");
  const day = valueOf("day");
  const hour = valueOf("hour");
  const minute = valueOf("minute");
  return year && month && day && hour && minute ? { year, month, day, hour, minute } : null;
}

export function beijingDateKey(value: string | Date = new Date()): string | null {
  const parts = timestampParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function formatBeijingDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parts = timestampParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : "-";
}

export function addCalendarDays(dateKey: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match || !Number.isInteger(days)) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calculateDeliveryDate(customerConfirmedAt: string | null | undefined, leadTimeDays: number): string | null {
  const confirmationDate = customerConfirmedAt ? beijingDateKey(customerConfirmedAt) : null;
  return confirmationDate ? addCalendarDays(confirmationDate, leadTimeDays) : null;
}

export function calendarDayDifference(fromDateKey: string | null, toDateKey: string): number | null {
  if (!fromDateKey || !/^\d{4}-\d{2}-\d{2}$/.test(toDateKey)) return null;
  const from = Date.parse(`${fromDateKey}T00:00:00Z`);
  const to = Date.parse(`${toDateKey}T00:00:00Z`);
  return Number.isNaN(from) || Number.isNaN(to) ? null : Math.round((to - from) / 86_400_000);
}
