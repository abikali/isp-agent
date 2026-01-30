import { db } from "@repo/database";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../orpc/procedures";

// Parse user agent string to get device info
function parseUserAgent(userAgent: string | null): {
	browser: string;
	os: string;
	device: string;
} {
	if (!userAgent) {
		return { browser: "Unknown", os: "Unknown", device: "Unknown" };
	}

	let browser = "Unknown";
	let os = "Unknown";
	let device = "Desktop";

	// Detect browser
	if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
		browser = "Chrome";
	} else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
		browser = "Safari";
	} else if (userAgent.includes("Firefox")) {
		browser = "Firefox";
	} else if (userAgent.includes("Edg")) {
		browser = "Edge";
	} else if (userAgent.includes("Opera") || userAgent.includes("OPR")) {
		browser = "Opera";
	}

	// Detect OS
	if (userAgent.includes("Windows")) {
		os = "Windows";
	} else if (userAgent.includes("Mac OS")) {
		os = "macOS";
	} else if (userAgent.includes("Linux") && !userAgent.includes("Android")) {
		os = "Linux";
	} else if (userAgent.includes("Android")) {
		os = "Android";
		device = "Mobile";
	} else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
		os = "iOS";
		device = userAgent.includes("iPad") ? "Tablet" : "Mobile";
	}

	return { browser, os, device };
}

// List sessions for the current user
const listSessions = protectedProcedure
	.route({
		method: "GET",
		path: "/sessions",
		tags: ["Sessions"],
		summary: "List sessions for the current user",
	})
	.input(
		z.object({
			currentSessionToken: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const sessions = await db.session.findMany({
			where: {
				userId: user.id,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: "desc" },
		});

		return sessions.map((session) => {
			const deviceInfo = parseUserAgent(session.userAgent);
			return {
				id: session.id,
				ipAddress: session.ipAddress,
				browser: deviceInfo.browser,
				os: deviceInfo.os,
				device: deviceInfo.device,
				createdAt: session.createdAt,
				expiresAt: session.expiresAt,
				isCurrent: session.token === input.currentSessionToken,
				isImpersonated: !!session.impersonatedBy,
			};
		});
	});

// Revoke a specific session
const revokeSession = protectedProcedure
	.route({
		method: "DELETE",
		path: "/sessions/{id}",
		tags: ["Sessions"],
		summary: "Revoke a specific session",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		// Ensure the session belongs to the current user
		const session = await db.session.findFirst({
			where: {
				id: input.id,
				userId: user.id,
			},
		});

		if (!session) {
			return { success: false, message: "Session not found" };
		}

		await db.session.delete({
			where: { id: input.id },
		});

		return { success: true };
	});

// Revoke all other sessions (except current)
const revokeAllOtherSessions = protectedProcedure
	.route({
		method: "DELETE",
		path: "/sessions/others",
		tags: ["Sessions"],
		summary: "Revoke all other sessions except current",
	})
	.input(
		z.object({
			currentSessionToken: z.string(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await db.session.deleteMany({
			where: {
				userId: user.id,
				token: { not: input.currentSessionToken },
			},
		});

		return { success: true };
	});

export const sessionsRouter = publicProcedure.router({
	list: listSessions,
	revoke: revokeSession,
	revokeAllOthers: revokeAllOtherSessions,
});
