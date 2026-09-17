/**
 * Customer GPS pin helpers, shared by the iRadius import paths (server) and the
 * collector/worker cards (browser).
 */

// iRadius stores "no pin" as 0 — and some rows carry float noise instead of a
// clean zero (e.g. GSMLng = 0.000008). A coordinate that close to 0 puts the
// customer in the Gulf of Guinea or on the Greenwich meridian, never in
// Lebanon, so it is treated exactly like a missing pin.
const MIN_ABS_COORDINATE = 0.001;

function usableCoordinate(value: number | null | undefined, max: number) {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		Math.abs(value) >= MIN_ABS_COORDINATE &&
		Math.abs(value) <= max
	);
}

/**
 * True when both coordinates are present and describe a real place. A pin
 * that fails this must not drive Directions and should prompt for a new one.
 */
export function isUsablePin(
	latitude: number | null | undefined,
	longitude: number | null | undefined,
): boolean {
	return usableCoordinate(latitude, 90) && usableCoordinate(longitude, 180);
}

/**
 * Google Maps turn-by-turn link. The `api=1` universal URL opens the Maps app
 * on both Android and iOS; `geo:` URIs do nothing on iOS.
 */
export function directionsUrl(destination: string): string {
	return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
