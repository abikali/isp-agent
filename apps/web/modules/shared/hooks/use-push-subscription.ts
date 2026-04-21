"use client";

import { orpcClient } from "@shared/lib/orpc";
import { useEffect } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padding = "=".repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(b64);
	const arrayBuffer = new ArrayBuffer(raw.length);
	const buf = new Uint8Array(arrayBuffer);
	for (let i = 0; i < raw.length; i++) {
		buf[i] = raw.charCodeAt(i);
	}
	return buf;
}

function bufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i] as number);
	}
	return btoa(binary);
}

async function registerPush(userId: string): Promise<void> {
	const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as
		| string
		| undefined;
	if (!publicKey) {
		return;
	}
	if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
		return;
	}

	const registration = await navigator.serviceWorker.register("/sw.js");

	let permission = Notification.permission;
	if (permission === "default") {
		permission = await Notification.requestPermission();
	}
	if (permission !== "granted") {
		return;
	}

	let subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey),
		});
	}

	const json = subscription.toJSON();
	const p256dh = json.keys?.p256dh;
	const auth = json.keys?.auth;
	if (!json.endpoint || !p256dh || !auth) {
		return;
	}

	// Fallback: on browsers where toJSON keys are empty, derive from getKey
	const resolvedP256dh =
		p256dh ||
		(subscription.getKey("p256dh")
			? bufferToBase64(subscription.getKey("p256dh") as ArrayBuffer)
			: "");
	const resolvedAuth =
		auth ||
		(subscription.getKey("auth")
			? bufferToBase64(subscription.getKey("auth") as ArrayBuffer)
			: "");

	if (!resolvedP256dh || !resolvedAuth) {
		return;
	}

	await orpcClient.push.subscribe({
		endpoint: json.endpoint,
		p256dh: resolvedP256dh,
		auth: resolvedAuth,
		userAgent: navigator.userAgent,
	});

	// Mark that we've already registered for this user/device to skip on next boot
	localStorage.setItem(`push-registered-${userId}`, "1");
}

/**
 * Registers the service worker and subscribes the current device to push.
 * Safe to call from any client component mounted inside an authenticated
 * route — it bails out silently if VAPID isn't configured or the browser
 * doesn't support push.
 */
export function usePushSubscription(userId: string | undefined) {
	useEffect(() => {
		if (!userId) {
			return;
		}
		registerPush(userId).catch(() => {
			// Swallow — push is best-effort
		});
	}, [userId]);
}
