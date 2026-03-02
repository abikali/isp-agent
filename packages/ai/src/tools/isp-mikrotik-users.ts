import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	getIspApiConfigFields,
	ispGet,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

interface MikrotikUser {
	userName: string;
	online: boolean;
}

const ispMikrotikUsersDef = toolDefinition({
	name: "isp-mikrotik-users",
	description:
		"List all users on a MikroTik interface. Returns [{userName, online}] for every customer sharing that interface.",
	inputSchema: z.object({
		mikrotikInterface: z
			.string()
			.describe(
				"The full mikrotikInterface value from isp-search-customer (e.g. 'ether3-OutToCRS-BsabaHome', '(VM-PPPoe4)-vlan1607-zone4-OLT1-eliehajjarb1')",
			),
	}),
});

function createIspMikrotikUsersTool(context: ToolContext) {
	return ispMikrotikUsersDef.server(async (args) => {
		return withIspErrorHandling(
			context,
			"isp-mikrotik-users",
			async (config) => {
				const iface = args.mikrotikInterface as string;
				const data = await ispGet<MikrotikUser[]>(
					config,
					"/mikrotik-user-list",
					{ mikrotikInterface: iface },
				);

				if (!Array.isArray(data) || data.length === 0) {
					return {
						success: false,
						message: `No users found on interface "${iface}".`,
					};
				}

				const onlineCount = data.filter((u) => u.online).length;
				const offlineCount = data.length - onlineCount;

				return {
					success: true,
					message: `${data.length} users on "${iface}": ${onlineCount} online, ${offlineCount} offline.`,
					users: data,
				};
			},
		);
	});
}

export const ispMikrotikUsers: RegisteredTool = {
	metadata: {
		id: "isp-mikrotik-users",
		name: "ISP Mikrotik Users",
		description:
			"List users on a Mikrotik access point with online/offline status",
		category: "isp",
		requiresConfig: true,
		configFields: getIspApiConfigFields(),
	},
	factory: createIspMikrotikUsersTool,
};
