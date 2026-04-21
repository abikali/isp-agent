/**
 * E2E test of all 6 iRadius direct-SQL wrappers against user 82740 (test5).
 * Run with: pnpm --filter @repo/api exec dotenv -e ../../.env.local -- pnpm exec tsx scripts/test-iradius-wrappers.ts
 *
 * biome-ignore-all lint/suspicious/noConsole: CLI smoke-test script; stdout is the intended output.
 */
import {
	executeIRadius,
	queryIRadius,
	withIRadiusConnection,
} from "@repo/database/iradius";
import {
	iradiusChangeCollector,
	iradiusResetMacAddress,
	iradiusSetIptvPrice,
	iradiusSetRecurringDiscount,
	iradiusUpdateUserName,
	iradiusUpdateUserPhones,
} from "../modules/customers/lib/iradius-api";

const USER_ID = 82740;
const customer = { externalId: "82740" };

async function snapshot(label: string) {
	return withIRadiusConnection(async (conn) => {
		const [u] = await queryIRadius(
			conn,
			`SELECT Id, FirstName, LastName, Mobile, Phone, Discount, CollectorId FROM User WHERE Id = ${USER_ID}`,
		);
		const [n] = await queryIRadius(
			conn,
			`SELECT MacAddress, IPTVPRICE FROM UserNas WHERE UserId = ${USER_ID}`,
		);
		console.log(`\n=== ${label} ===`);
		console.log("User :", JSON.stringify(u));
		console.log("Nas  :", JSON.stringify(n));
		return { u, n };
	});
}

async function main() {
	console.log("Starting iRadius wrapper E2E test against user 82740 (test5)");
	const initial = await snapshot("INITIAL STATE");

	console.log("\n[1/6] iradiusResetMacAddress");
	const r1 = await iradiusResetMacAddress(customer);
	console.log("  → affectedRows:", r1.affectedRows);
	await snapshot("after reset MAC");

	console.log("\n[2/6] iradiusUpdateUserName → Test User");
	const r2 = await iradiusUpdateUserName(customer, "Test", "User");
	console.log("  → affectedRows:", r2.affectedRows);
	await snapshot("after update name");

	console.log("\n[3/6] iradiusUpdateUserPhones → 70000000-01000000");
	const r3 = await iradiusUpdateUserPhones(customer, "70000000-01000000");
	console.log("  → affectedRows:", r3.affectedRows);
	await snapshot("after update phones");

	console.log("\n[4/6] iradiusSetRecurringDiscount → 5.50");
	const r4 = await iradiusSetRecurringDiscount(customer, 5.5);
	console.log("  → affectedRows:", r4.affectedRows);
	await snapshot("after set discount");

	console.log("\n[5/6] iradiusSetIptvPrice → 7.00");
	const r5 = await iradiusSetIptvPrice(customer, 7.0);
	console.log("  → affectedRows:", r5.affectedRows);
	await snapshot("after set IPTV price");

	console.log("\n[6/6] iradiusChangeCollector → 57652 (colljobran)");
	const r6 = await iradiusChangeCollector(customer, 57652);
	console.log("  → affectedRows:", r6.affectedRows);
	await snapshot("after change collector");

	console.log("\n\n======= REVERTING =======");
	const originalCollectorId = initial.u?.["CollectorId"] as number | null;
	const originalDiscount = (initial.u?.["Discount"] as number | null) ?? 0;
	const originalIptv = (initial.n?.["IPTVPRICE"] as number | null) ?? 0;
	const originalFirstName = (initial.u?.["FirstName"] as string) ?? "";
	const originalLastName = (initial.u?.["LastName"] as string) ?? "";
	const originalMobile = (initial.u?.["Mobile"] as string) ?? "";

	await iradiusChangeCollector(customer, originalCollectorId);
	await iradiusSetIptvPrice(customer, originalIptv);
	await iradiusSetRecurringDiscount(customer, originalDiscount);
	await iradiusUpdateUserPhones(customer, originalMobile);
	await iradiusUpdateUserName(
		customer,
		originalFirstName || "test5",
		originalLastName || "",
	);
	const originalMac = initial.n?.["MacAddress"];
	await withIRadiusConnection(async (conn) => {
		await executeIRadius(
			conn,
			"UPDATE UserNas SET MacAddress = ? WHERE UserId = ?",
			[(originalMac as string | null) ?? null, USER_ID],
		);
	});

	await snapshot("FINAL STATE (after revert)");
	console.log("\n✅ Done");
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("FAILED:", err);
		process.exit(1);
	});
