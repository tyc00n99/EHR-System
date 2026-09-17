/**
 * Sign-in lockout: five wrong passwords in a row lock the account for 15 minutes, and every
 * further failure doubles the wait, up to a day. Pure, so it can be tested without a database.
 */
export const LOCK_AFTER = 5;
const BASE_MS = 15 * 60 * 1000;
const MAX_MS = 24 * 60 * 60 * 1000;

/** Milliseconds to lock for after this many consecutive failures; 0 while under the threshold. */
export function lockDurationMs(failures: number): number {
  if (failures < LOCK_AFTER) return 0;
  return Math.min(BASE_MS * 2 ** (failures - LOCK_AFTER), MAX_MS);
}
