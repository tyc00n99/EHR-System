import { randomInt } from "node:crypto";

/** Six-digit signing code the person keeps private and enters to co-sign shift notes. */
export function generateClientCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
