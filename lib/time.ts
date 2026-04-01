import type { SiteConfig } from "@/lib/site-config";

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toMonthKey(date: Date): string {
  return toDateKey(date).slice(0, 7);
}

export function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

export function isFourthFriday(dateKey: string): boolean {
  const date = parseDateKey(dateKey);
  return date.getDay() === 5 && date.getDate() >= 22 && date.getDate() <= 28;
}

export function isSaturday(dateKey: string): boolean {
  return parseDateKey(dateKey).getDay() === 6;
}

export function isClosedDate(dateKey: string, config: SiteConfig): boolean {
  return config.saturdayClosed && isSaturday(dateKey);
}

export function getDailyClosingHour(dateKey: string, config: SiteConfig): number {
  return isFourthFriday(dateKey) ? Math.min(config.closeHour, config.fridayClosedFromHour) : config.closeHour;
}

export function getEarliestStartHour(dateKey: string, config: SiteConfig): number {
  const todayKey = toDateKey(new Date());
  if (dateKey !== todayKey) {
    return config.openHour;
  }

  const now = new Date();
  const roundedHour = now.getMinutes() > 0 ? now.getHours() + 1 : now.getHours();
  return Math.max(config.openHour, roundedHour);
}

export function getSlotStartHours(dateKey: string, config: SiteConfig): number[] {
  if (isClosedDate(dateKey, config)) {
    return [];
  }

  const closingHour = getDailyClosingHour(dateKey, config);
  const earliestStartHour = getEarliestStartHour(dateKey, config);
  const lastStartHour = closingHour - config.minBookingHours;

  if (lastStartHour < earliestStartHour) {
    return [];
  }

  return Array.from(
    { length: lastStartHour - earliestStartHour + 1 },
    (_, index) => earliestStartHour + index,
  );
}

export function formatCompactTime(hour: number, minute = 0): string {
  const displayHour = String(hour).padStart(2, "0");
  const displayMinute = String(minute).padStart(2, "0");
  return `${displayHour}:${displayMinute}`;
}

export function formatDetailedTime(hour: number, minute = 0): string {
  return formatCompactTime(hour, minute);
}

export function formatDisplayTimeRange(startHour: number, durationHours: number): string {
  const rawEndMinutes = (startHour + durationHours + 1) * 60 - 10;
  const endHour = Math.floor(rawEndMinutes / 60);
  const endMinute = rawEndMinutes % 60;
  return `${formatCompactTime(startHour)} ~ ${formatCompactTime(endHour, endMinute)}`;
}

export function formatFullDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${dayLabels[date.getDay()]})`;
}

export function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

export function shiftMonth(monthKey: string, diff: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + diff, 1);
  return toMonthKey(date);
}

export function hoursOverlap(
  startHour: number,
  durationHours: number,
  otherStartHour: number,
  otherDurationHours: number,
): boolean {
  const endHour = startHour + durationHours;
  const otherEndHour = otherStartHour + otherDurationHours;
  return startHour < otherEndHour && otherStartHour < endHour;
}
