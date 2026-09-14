/**
 * Point-in-time location handling for clock-in and clock-out. No tracking between them: a visit
 * has at most two fixes, and each is classified once, here.
 */
import type { EvvPolicy } from "@/db/schema";
import type { Coordinates, LocationState, LocationType } from "./types";

const R = 6_371_000;

/** Great-circle distance in metres. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function validCoordinates(c: Partial<Coordinates> | null | undefined): c is Coordinates {
  return Boolean(c && typeof c.lat === "number" && typeof c.lng === "number" && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180 && (c.accuracy == null || (Number.isFinite(c.accuracy) && c.accuracy >= 0)));
}

export interface LocationClassification {
  state: LocationState;
  distanceFromHomeMeters: number | null;
}

/**
 * Classify one fix against the policy. The states are deliberately distinct: "outside the
 * geofence" and "no fix at all" and "permission denied" are different facts a reviewer needs.
 */
export function classifyLocation(input: {
  coordinates: Coordinates | null;
  permissionDenied: boolean;
  locationType: LocationType | null;
  home: { lat: number; lng: number } | null;
  registeredLocationRef: string | null;
  method: "mobile" | "ivr" | "fob" | "live_in" | "manual" | "imported" | "other";
  policy: Pick<EvvPolicy, "geofenceMeters" | "maxAccuracyMeters">;
}): LocationClassification {
  const { coordinates, permissionDenied, locationType, home, policy } = input;
  if (locationType === "protected") return { state: "protected_address", distanceFromHomeMeters: null };
  if (input.method === "ivr" || input.method === "fob") return { state: input.registeredLocationRef ? "registered_location" : "unavailable", distanceFromHomeMeters: null };
  if (permissionDenied) return { state: "permission_denied", distanceFromHomeMeters: null };
  if (!coordinates) return { state: "unavailable", distanceFromHomeMeters: null };
  if (coordinates.accuracy != null && coordinates.accuracy > policy.maxAccuracyMeters) return { state: "accuracy_insufficient", distanceFromHomeMeters: home ? haversineMeters(coordinates, home) : null };
  if (locationType === "community" || locationType === "alternate") return { state: "community", distanceFromHomeMeters: home ? haversineMeters(coordinates, home) : null };
  if (!home) return { state: "captured", distanceFromHomeMeters: null };
  const d = haversineMeters(coordinates, home);
  // The fix's own uncertainty counts toward the fence: a 60 m-accurate fix 520 m out is inside a 500 m fence.
  const effective = Math.max(0, d - (coordinates.accuracy ?? 0));
  return { state: effective <= policy.geofenceMeters ? "inside_geofence" : "outside_geofence", distanceFromHomeMeters: d };
}
