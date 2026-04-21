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
}
