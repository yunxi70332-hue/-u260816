export const DEFAULT_DELIVERY_LEAD_TIME_DAYS = 30;
export const DELIVERY_TIME_ZONE = "Asia/Shanghai";

function dateParts(value: string | Date): { year: number; month: number; day: number } {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid delivery schedule date");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DELIVERY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (![year, month, day].every(Number.isInteger)) throw new Error("Invalid delivery schedule date");
  return { year, month, day };
}

export function beijingDateKey(value: string | Date): string {
  const { year, month, day } = dateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addBeijingCalendarDays(dateKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("Invalid Beijing date key");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calculateExpectedDeliveryDate(customerConfirmedAt: string | Date, leadTimeDays: number): string {
  return addBeijingCalendarDays(beijingDateKey(customerConfirmedAt), leadTimeDays);
}
