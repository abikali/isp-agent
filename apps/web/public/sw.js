/* global self */

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
	event.waitUntil(handlePush(event));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = event.notification.data?.url ?? "/app";
	event.waitUntil(
		(async () => {
			const clientsList = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			for (const client of clientsList) {
				if ("focus" in client) {
					await client.focus();
					if ("navigate" in client) {
						try {
							await client.navigate(url);
						} catch {
							// Cross-origin navigate can throw — ignore
						}
					}
					return;
				}
			}
			await self.clients.openWindow(url);
		})(),
	);
});

async function handlePush(event) {
	let count = null;
	try {
		if (event.data) {
			const payload = event.data.json();
			if (typeof payload.count === "number") {
				count = payload.count;
			}
		}
	} catch {
		// Fall through to fetch fallback
	}

	if (count === null) {
		try {
			const res = await fetch("/api/push/badge-count", {
				credentials: "include",
			});
			if (res.ok) {
				const body = await res.json();
				count = typeof body?.count === "number" ? body.count : 0;
			} else {
				count = 0;
			}
		} catch {
			count = 0;
		}
	}

	if (typeof self.registration.setAppBadge === "function") {
		if (count > 0) {
			await self.registration.setAppBadge(count);
		} else {
			await self.registration.clearAppBadge();
		}
	}

	// Android launchers tie the icon badge to an active notification, and
	// Chrome revokes subscriptions that receive silent pushes under
	// userVisibleOnly. Always surface a notification so the launcher paints
	// the badge and the subscription stays alive.
	if (count > 0) {
		await self.registration.showNotification("LibanCom", {
			body: `${count} payment${count === 1 ? "" : "s"} need review`,
			tag: "badge",
			renotify: false,
			icon: "/favicon-192x192.png",
			badge: "/favicon-192x192.png",
			data: { url: "/app" },
		});
	} else {
		const existing = await self.registration.getNotifications({
			tag: "badge",
		});
		for (const n of existing) {
			n.close();
		}
	}
}
