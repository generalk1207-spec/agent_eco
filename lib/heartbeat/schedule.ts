import { CronExpressionParser } from "cron-parser";

/** Thrown when a cron expression or timezone can't be parsed. */
export class InvalidScheduleError extends Error {
  constructor(cronExpression: string, timezone: string, cause?: unknown) {
    super(`Invalid schedule "${cronExpression}" in timezone "${timezone}"`, { cause });
    this.name = "InvalidScheduleError";
  }
}

/**
 * Next occurrence of `cronExpression` strictly after `from`, evaluated in the owner's
 * IANA `timezone` (so "0 9 * * *" means 09:00 local time, DST included).
 */
export function computeNextRunAt(cronExpression: string, timezone: string, from: Date = new Date()): Date {
  try {
    return CronExpressionParser.parse(cronExpression, { currentDate: from, tz: timezone })
      .next()
      .toDate();
  } catch (err) {
    throw new InvalidScheduleError(cronExpression, timezone, err);
  }
}

export function isValidSchedule(cronExpression: string, timezone: string): boolean {
  try {
    computeNextRunAt(cronExpression, timezone);
    return true;
  } catch {
    return false;
  }
}
