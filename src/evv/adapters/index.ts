/** Picks the aggregator adapter from configuration. Anything but an explicit HHAX setting is the mock. */
import { hhaxConfigFromEnv, MinnesotaHhaxAdapter } from "./hhax-minnesota";
import { MockAggregatorAdapter } from "./mock";
import type { EvvAggregatorAdapter } from "./types";

export function adapterFromEnv(env: NodeJS.ProcessEnv = process.env): EvvAggregatorAdapter {
  if ((env.EVV_AGGREGATOR_ADAPTER ?? "mock").toLowerCase() === "hhax_mn") return new MinnesotaHhaxAdapter(hhaxConfigFromEnv(env));
  return new MockAggregatorAdapter();
}

export type { EvvAggregatorAdapter } from "./types";
