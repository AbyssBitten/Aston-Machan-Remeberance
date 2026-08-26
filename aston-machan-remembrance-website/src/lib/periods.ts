export type PeriodKey = "day" | "week" | "month";

export type Window = { start: Date; end: Date; label: string };

const DAY_MS = 86_400_000;

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

/** ISO week: Monday 00:00:00 UTC. */
export function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const weekday = (day.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(day.getTime() - weekday * DAY_MS);
}

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

/** Live window boundaries. Counters reset exactly at these instants. */
export function periodWindows(now: Date = new Date()): Record<PeriodKey, Window> {
  const dayStart = startOfUtcDay(now);
  const weekStart = startOfUtcWeek(now);
  const monthStart = startOfUtcMonth(now);
  return {
    day: { start: dayStart, end: new Date(dayStart.getTime() + DAY_MS), label: "today" },
    week: {
      start: weekStart,
      end: new Date(weekStart.getTime() + 7 * DAY_MS),
      label: "this week",
    },
    month: {
      start: monthStart,
      end: addMonths(monthStart, 1),
      label: "this month",
    },
  };
}

/** "1d 04:22:10" — used for the reset countdowns. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatRelativeTime(from: Date, now: Date = new Date()): string {
  const seconds = Math.max(1, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
