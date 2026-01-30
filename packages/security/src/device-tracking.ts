import * as crypto from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import type { DeviceInfo } from "./types";

/**
 * Generate a device fingerprint from device info
 */
export function generateDeviceFingerprint(info: DeviceInfo): string {
	// Create a fingerprint based on user agent
	// Note: This is a simple implementation; production apps might want
	// to use more sophisticated fingerprinting (screen size, fonts, etc.)
	const data = info.userAgent;
	return crypto
		.createHash("sha256")
		.update(data)
		.digest("hex")
		.substring(0, 32);
}

/**
 * Parse user agent to get a friendly device name
 */
export function parseDeviceName(userAgent: string): string {
	// Simple parser - in production you might use a library like ua-parser-js
	const ua = userAgent.toLowerCase();

	let browser = "Unknown Browser";
	let os = "Unknown OS";

	// Detect browser
	if (ua.includes("chrome") && !ua.includes("edg")) {
		browser = "Chrome";
	} else if (ua.includes("firefox")) {
		browser = "Firefox";
	} else if (ua.includes("safari") && !ua.includes("chrome")) {
		browser = "Safari";
	} else if (ua.includes("edg")) {
		browser = "Edge";
	} else if (ua.includes("opera") || ua.includes("opr")) {
		browser = "Opera";
	}

	// Detect OS
	if (ua.includes("windows")) {
		os = "Windows";
	} else if (ua.includes("mac os") || ua.includes("macintosh")) {
		os = "Mac";
	} else if (ua.includes("linux")) {
		os = "Linux";
	} else if (ua.includes("android")) {
		os = "Android";
	} else if (ua.includes("iphone") || ua.includes("ipad")) {
		os = "iOS";
	}

	return `${browser} on ${os}`;
}

/**
 * Check if a device is known for a user
 */
export async function isKnownDevice(
	userId: string,
	deviceInfo: DeviceInfo,
): Promise<boolean> {
	if (!config.security.deviceTracking.enabled) {
		return true; // Treat all devices as known if tracking is disabled
	}

	const fingerprint = generateDeviceFingerprint(deviceInfo);

	const device = await db.knownDevice.findUnique({
		where: {
			userId_deviceFingerprint: {
				userId,
				deviceFingerprint: fingerprint,
			},
		},
	});

	return !!device;
}

/**
 * Register a device for a user
 */
export async function registerDevice(
	userId: string,
	deviceInfo: DeviceInfo,
): Promise<{ isNew: boolean; deviceId: string }> {
	if (!config.security.deviceTracking.enabled) {
		return { isNew: false, deviceId: "" };
	}

	const fingerprint = generateDeviceFingerprint(deviceInfo);
	const deviceName = parseDeviceName(deviceInfo.userAgent);

	// Check if device already exists
	const existing = await db.knownDevice.findUnique({
		where: {
			userId_deviceFingerprint: {
				userId,
				deviceFingerprint: fingerprint,
			},
		},
	});

	if (existing) {
		// Update last seen
		await db.knownDevice.update({
			where: { id: existing.id },
			data: {
				lastSeenAt: new Date(),
				ipAddress: deviceInfo.ipAddress ?? null,
			},
		});
		return { isNew: false, deviceId: existing.id };
	}

	// Enforce max devices limit
	const deviceCount = await db.knownDevice.count({
		where: { userId },
	});

	if (deviceCount >= config.security.deviceTracking.maxKnownDevices) {
		// Remove oldest device
		const oldest = await db.knownDevice.findFirst({
			where: { userId },
			orderBy: { lastSeenAt: "asc" },
		});

		if (oldest) {
			await db.knownDevice.delete({
				where: { id: oldest.id },
			});
		}
	}

	// Create new device
	const device = await db.knownDevice.create({
		data: {
			id: createId(),
			userId,
			deviceFingerprint: fingerprint,
			deviceName,
			userAgent: deviceInfo.userAgent,
			ipAddress: deviceInfo.ipAddress ?? null,
		},
	});

	logger.info("New device registered", {
		userId,
		deviceId: device.id,
		deviceName,
	});

	return { isNew: true, deviceId: device.id };
}

/**
 * Send new device notification
 */
export async function sendNewDeviceNotification(
	userId: string,
	deviceInfo: DeviceInfo,
): Promise<void> {
	if (!config.security.deviceTracking.notifyNewDevice) {
		return;
	}

	try {
		const user = await db.user.findUnique({
			where: { id: userId },
			select: { email: true, name: true },
		});

		if (!user) {
			return;
		}

		const deviceName = parseDeviceName(deviceInfo.userAgent);

		await sendEmail({
			to: user.email,
			subject: "New device login detected",
			html: `
				<h2>New Device Login</h2>
				<p>Hi ${user.name || "there"},</p>
				<p>We noticed a new login to your account from a device we don't recognize.</p>
				<p><strong>Device:</strong> ${deviceName}</p>
				${deviceInfo.ipAddress ? `<p><strong>IP Address:</strong> ${deviceInfo.ipAddress}</p>` : ""}
				<p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
				<p>If this was you, you can safely ignore this email. We've added this device to your trusted devices.</p>
				<p>If this wasn't you, we recommend:</p>
				<ul>
					<li>Changing your password immediately</li>
					<li>Reviewing your active sessions</li>
					<li>Enabling two-factor authentication if not already enabled</li>
				</ul>
			`,
		});

		logger.debug("New device notification sent", { userId, deviceName });
	} catch (error) {
		logger.error("Failed to send new device notification", {
			error,
			userId,
		});
	}
}

/**
 * Get all known devices for a user
 */
export async function getUserDevices(userId: string): Promise<
	{
		id: string;
		deviceName: string | null;
		userAgent: string | null;
		ipAddress: string | null;
		lastSeenAt: Date;
		createdAt: Date;
	}[]
> {
	return db.knownDevice.findMany({
		where: { userId },
		orderBy: { lastSeenAt: "desc" },
		select: {
			id: true,
			deviceName: true,
			userAgent: true,
			ipAddress: true,
			lastSeenAt: true,
			createdAt: true,
		},
	});
}

/**
 * Remove a known device
 */
export async function removeDevice(
	userId: string,
	deviceId: string,
): Promise<void> {
	await db.knownDevice.deleteMany({
		where: {
			id: deviceId,
			userId, // Ensure user owns the device
		},
	});

	logger.info("Device removed", { userId, deviceId });
}

/**
 * Handle new device login - combines registration and notification
 */
export async function handleDeviceLogin(
	userId: string,
	deviceInfo: DeviceInfo,
): Promise<void> {
	const { isNew } = await registerDevice(userId, deviceInfo);

	if (isNew) {
		await sendNewDeviceNotification(userId, deviceInfo);
	}
}
