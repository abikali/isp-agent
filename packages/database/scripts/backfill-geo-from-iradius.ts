/**
 * One-off: copy GPS pins from iRadius into customers that have none.
 *
 * `latitude`/`longitude` are LOCAL_AUTHORITATIVE — seeded once at create,
 * then ignored — so customers created before the seeding existed never got
 * a pin even though iRadius holds one. Read-only on iRadius; writes local
 * rows that are currently NULL only.
 *
 * Run (locally):   pnpm --filter @repo/database backfill:geo -- --org <id> [--dry]
 * Run (prod):      docker exec <libancom-worker> sh -c \
 *                    'cd /app/packages/database && node --import tsx scripts/backfill-geo-from-iradius.ts --org <id>'
 */
// biome-ignore-all lint/suspicious/noConsole: operator script
import { db } from "../index";
import { queryIRadius, withIRadiusConnection } from "../lib/iradius";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const orgFlag = args.indexOf("--org");
const organizationId = orgFlag >= 0 ? args[orgFlag + 1] : undefined;

async function main() {
	const customers = await db.customer.findMany({
		where: {
			deletedAt: null,
			externalId: { not: null },
			OR: [{ latitude: null }, { longitude: null }],
			...(organizationId ? { organizationId } : {}),
		},
		select: { id: true, externalId: true },
	});
	console.log(`${customers.length} linked customers without a pin`);
	if (customers.length === 0) {
		return;
	}

	const byExternalId = new Map<number, string[]>();
	for (const c of customers) {
		const id = Number.parseInt(c.externalId as string, 10);
		if (Number.isFinite(id)) {
			byExternalId.set(id, [...(byExternalId.get(id) ?? []), c.id]);
		}
	}

	const ids = [...byExternalId.keys()];
	const pins = await withIRadiusConnection(async (conn) => {
		const out: Array<{ userId: number; lat: number; lng: number }> = [];
		for (let i = 0; i < ids.length; i += 500) {
			const chunk = ids.slice(i, i + 500);
			const rows = await queryIRadius(
				conn,
				`SELECT UserId, GSMLat, GSMLng FROM UserNas WHERE UserId IN (${chunk.map(() => "?").join(",")}) AND GSMLat IS NOT NULL AND GSMLat <> 0`,
				chunk,
			);
			for (const r of rows) {
				out.push({
					userId: Number(r["UserId"]),
					lat: Number(r["GSMLat"]),
					lng: Number(r["GSMLng"]),
				});
			}
		}
		return out;
	});
	console.log(`${pins.length} of them have a pin in iRadius`);

	let updated = 0;
	for (const pin of pins) {
		if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) {
			continue;
		}
		for (const customerId of byExternalId.get(pin.userId) ?? []) {
			if (!dry) {
				await db.customer.update({
					where: { id: customerId },
					data: { latitude: pin.lat, longitude: pin.lng },
				});
			}
			updated++;
		}
	}
	console.log(`${dry ? "would update" : "updated"} ${updated} customers`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => db.$disconnect());
