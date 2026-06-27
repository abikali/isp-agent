export function isPreviewMediaUrl(url: string): boolean {
	return /(^|\.)scontent\.whatsapp\.net\//i.test(url.trim());
}
