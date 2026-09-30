import { distanceMeters, isBoxInterface } from "@repo/utils";

/** Lat/lng deltas bounding a circle of `radiusM` around a pin. */
export function boundingBox(
	latitude: number,
	longitude: number,
	radiusM: number,
): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
	const dLat = radiusM / 111_320;
	const dLng =
		radiusM /
		(111_320 * Math.max(0.01, Math.cos((latitude * Math.PI) / 180)));
	return {
		latMin: latitude - dLat,
		latMax: latitude + dLat,
		lngMin: longitude - dLng,
		lngMax: longitude + dLng,
	};
}

export interface BoxCandidate {
	id: string;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	status: string;
	latitude: number | null;
	longitude: number | null;
	mikrotikInterface: string | null;
}

/**
 * Interfaces of the box customers within `radiusM` of the pin, nearest box
 * first. Each nearby customer carries its distance.
 */
export function groupNearbyBoxes(
	origin: { latitude: number; longitude: number },
	candidates: BoxCandidate[],
	radiusM: number,
): Array<{
	iface: string;
	nearby: Array<BoxCandidate & { distanceM: number }>;
}> {
	const byInterface = new Map<
		string,
		Array<BoxCandidate & { distanceM: number }>
	>();
	for (const c of candidates) {
		if (
			!isBoxInterface(c.mikrotikInterface) ||
			c.latitude === null ||
			c.longitude === null
		) {
			continue;
		}
		const distanceM = distanceMeters(origin, {
			latitude: c.latitude,
			longitude: c.longitude,
		});
		if (distanceM > radiusM) {
			continue;
		}
		const iface = c.mikrotikInterface as string;
		const list = byInterface.get(iface) ?? [];
		list.push({ ...c, distanceM: Math.round(distanceM) });
		byInterface.set(iface, list);
	}
	return [...byInterface.entries()]
		.map(([iface, nearby]) => ({
			iface,
			nearby: nearby.sort((a, b) => a.distanceM - b.distanceM),
		}))
		.sort(
			(a, b) =>
				(a.nearby[0]?.distanceM ?? 0) - (b.nearby[0]?.distanceM ?? 0),
		);
}
