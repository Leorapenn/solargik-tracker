// Site information of a project (profile section): contact on site, working hours, unloading and access, GPS.

export const SITE_EMAIL_MAX = 200;

// An email address typed by hand: one address, no spaces, something@something.tld.
export function checkSiteEmail(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = (raw ?? "").trim();
  if (!value) return { ok: true, value: null };
  if (value.length > SITE_EMAIL_MAX || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value)) return { ok: false, error: "The site contact's email doesn't look right." };
  return { ok: true, value };
}

export type Coordinates = { lat: number; lon: number };

const round = (n: number) => Number(n.toFixed(6));

// GPS coordinates as decimal degrees: "45.4642, 9.1900" (also a space or semicolon between, or a pasted Google Maps pair).
// Degrees-minutes-seconds are refused rather than guessed. Latitude -90..90, longitude -180..180.
export function parseCoordinates(raw: string | null | undefined): { ok: true; value: Coordinates | null } | { ok: false; error: string } {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, value: null };
  const parts = text.split(/\s*[,;]\s*|\s+/).filter(Boolean);
  const number = /^[+-]?\d{1,3}(\.\d+)?$/;
  if (parts.length !== 2 || !parts.every((p) => number.test(p))) {
    return { ok: false, error: "GPS coordinates must be two decimal numbers, latitude then longitude, like 45.4642, 9.1900." };
  }
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (lat < -90 || lat > 90) return { ok: false, error: "The latitude must be between -90 and 90." };
  if (lon < -180 || lon > 180) return { ok: false, error: "The longitude must be between -180 and 180." };
  return { ok: true, value: { lat: round(lat), lon: round(lon) } };
}

// What is stored: the normalised "lat, lon" text.
export function formatCoordinates(c: Coordinates): string {
  return `${c.lat}, ${c.lon}`;
}

// A link that opens the point on a map, or null when the text isn't valid coordinates.
export function mapLink(raw: string | null | undefined): string | null {
  const parsed = parseCoordinates(raw);
  if (!parsed.ok || !parsed.value) return null;
  return `https://www.google.com/maps?q=${parsed.value.lat},${parsed.value.lon}`;
}
