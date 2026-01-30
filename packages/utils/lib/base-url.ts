export function getBaseUrl() {
	if (process.env["SITE_URL"]) {
		return process.env["SITE_URL"];
	}
	if (process.env["VITE_SITE_URL"]) {
		return process.env["VITE_SITE_URL"];
	}
	if (process.env["VERCEL_URL"]) {
		return `https://${process.env["VERCEL_URL"]}`;
	}
	return `http://localhost:${process.env["PORT"] ?? 3030}`;
}
