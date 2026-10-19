import { MHCP_FFS_V1 } from "./mhcp-ffs";
import type { PayerProfile } from "./types";

export type { PayerProfile } from "./types";

/** Every profile version ever used. Never delete one: claim versions point at them. */
const PROFILES: PayerProfile[] = [MHCP_FFS_V1];

export const DEFAULT_PROFILE = MHCP_FFS_V1;

export function payerProfile(key: string, version: string): PayerProfile {
  const p = PROFILES.find((x) => x.key === key && x.version === version);
  if (!p) throw new Error(`Unknown payer profile ${key}@${version}`);
  return p;
}
