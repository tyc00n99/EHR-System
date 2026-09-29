import "server-only";

/**
 * Turns a typed street address into a point, for manual notes (Sept 29, 2026): the supervisor gives the
 * address the visit happened at, and EVV needs coordinates. Uses the U.S. Census Bureau's public
 * geocoder — free, no key, U.S. addresses only. Only the address is sent: no name, no PMI, nothing
 * that says who lives there. Returns null when there is no confident match, so the caller can ask the
 * person to check the address rather than store a guess.
 */
export interface GeoPoint { lat: number; lng: number; matched: string }

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const q = address.trim();
  if (q.length < 6) return null;
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] } };
    const m = body.result?.addressMatches?.[0];
    if (!m || !Number.isFinite(m.coordinates.x) || !Number.isFinite(m.coordinates.y)) return null;
    return { lat: m.coordinates.y, lng: m.coordinates.x, matched: m.matchedAddress };
  } catch {
    return null;
  }
}
