import { requirePermission } from "@repo/api/lib/permission";
import { queryIRadiusNetworkMonitor } from "@repo/database/iradius";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getNasHealth = protectedProcedure
	.route({
		method: "GET",
		path: "/iradius/nas-health",
		tags: ["iRadius"],
		summary: "Station + AccessPoint live monitoring snapshot",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"stations",
			"view",
		);

		const monitor = await queryIRadiusNetworkMonitor();
		if (!monitor) {
			return {
				stations: [] as Array<{
					externalId: string;
					online: boolean;
					uptime: string | null;
					boardName: string | null;
					cpuLoad: string | null;
					voltage: string | null;
					version: string | null;
				}>,
				accessPoints: [] as Array<{
					externalId: string;
					online: boolean;
					uptime: string | null;
					signal: string | null;
					boardName: string | null;
					version: string | null;
					fullDuplex: boolean;
				}>,
				available: false,
			};
		}

		return {
			stations: monitor.stations.map((s) => ({
				externalId: s.externalId,
				online: s.online,
				uptime: s.uptime,
				boardName: s.boardName,
				cpuLoad: s.cpuLoad,
				voltage: s.voltage,
				version: s.version,
			})),
			accessPoints: monitor.accessPoints.map((ap) => ({
				externalId: ap.externalId,
				online: ap.online,
				uptime: ap.uptime,
				signal: ap.signal,
				boardName: ap.boardName,
				version: ap.version,
				fullDuplex: ap.fullDuplex,
			})),
			available: true,
		};
	});
