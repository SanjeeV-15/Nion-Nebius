// Turns a person's location into something Nion can use.
//
// The browser gives GPS coordinates (numbers). Web search wants a place name, so we
// look the coordinates up. The main lookup is OpenStreetMap's free "Nominatim"
// service, which gives a neighbourhood (like "Brickell") as well as the city, which
// is what makes "near me" mean near me. If that is unreachable, a small, fast
// the AI names just the city, state and country instead.
//
// Nominatim's rules (https://operations.osmfoundation.org/policies/nominatim/): no
// more than one request a second, and an identifying User-Agent. Nion looks up one
// place a person, remembers each answer, and waits between requests.

const cache = new Map();
let lastRequestAt = 0;

/** Keep a place word safe to put into Nion's instructions: letters and a few marks. */
export function cleanPlacePart(value, max = 60) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^\p{L}\p{M}\s.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned && cleaned !== "-" ? cleaned : undefined;
}

/** Reads Nominatim's answer into { area, city, region, country }, or null if there is no city. */
export function placeFromNominatim(json) {
  const a = json?.address ?? {};
  const city = cleanPlacePart(a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? a.county);
  if (!city) return null;
  const country = /^[A-Za-z]{2}$/.test(a.country_code ?? "") ? a.country_code.toUpperCase() : undefined;
  return {
    area: cleanPlacePart(a.neighbourhood ?? a.suburb ?? a.quarter),
    city,
    region: cleanPlacePart(a.state),
    country,
  };
}

/** Reads a line like "Miami | Florida | US" (from the AI) into a place. A dash means "not sure". */
export function parsePlaceLine(line) {
  const parts = String(line ?? "").split("|").map((part) => part.trim());
  const city = cleanPlacePart(parts[0]);
  if (!city) return null;
  return {
    city,
    region: cleanPlacePart(parts[1]),
    country: /^[A-Za-z]{2}$/.test(parts[2] ?? "") ? parts[2].toUpperCase() : undefined,
  };
}

/** "Brickell, Miami, Florida, US": how a place is written in Nion's instructions. */
export function describePlace(place) {
  return [place?.area, place?.city, place?.region, place?.country].filter(Boolean).join(", ");
}

async function fromNominatim(lat, lon, fetchImpl = fetch) {
  // Be polite: at least a second between requests.
  const wait = lastRequestAt + 1100 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${lat}&lon=${lon}`;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": "Nion/0.1 (hackathon demo; github.com/SanjeeV-15)" },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`Nominatim said ${response.status}`);
  return placeFromNominatim(await response.json());
}

// The fallback when OpenStreetMap can't help: ask the AI that Nion is configured with
// (Nemotron on Nebius). `complete` takes a question and returns its short answer.
async function fromModel(complete, lat, lon) {
  const line = await complete(
    `GPS coordinates: ${lat.toFixed(4)},${lon.toFixed(4)}. ` +
      "Reply with only: city | state or region | two-letter country code. " +
      "Use a dash for any part you are not sure of."
  );
  return parsePlaceLine(String(line ?? "").trim());
}

/**
 * Name the place for some coordinates. `complete(question)` asks the configured AI, and is
 * only used as the fallback when OpenStreetMap can't name the place. `fetchImpl` is for tests.
 * Returns { area?, city, region?, country? } or null if it couldn't be worked out.
 */
export async function resolvePlace(complete, lat, lon, { fetchImpl = fetch } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  // Three decimal places is about a hundred metres: close enough to share an answer.
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  let place = null;
  try {
    place = await fromNominatim(lat, lon, fetchImpl);
  } catch (error) {
    console.error("Place lookup (OpenStreetMap) failed, asking the AI instead:", error?.message ?? error);
  }
  if (!place) {
    try {
      place = await fromModel(complete, lat, lon);
    } catch (error) {
      console.error("Place lookup (AI fallback) failed:", error?.message ?? error);
    }
  }

  if (place) cache.set(key, place);
  return place;
}
