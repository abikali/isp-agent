import type { SaltiTemplate } from "@repo/integrations";

/**
 * Count `{{N}}` placeholders in a template string.
 * Salti/WhatsApp templates use 1-based numeric placeholders like {{1}} {{2}}.
 */
export function countPlaceholders(text: string | undefined): number {
	if (!text) {
		return 0;
	}
	const matches = text.match(/\{\{\d+\}\}/g);
	return matches?.length ?? 0;
}

export function getTemplatePlaceholderCounts(template: SaltiTemplate): {
	header: number;
	body: number;
	button: number;
} {
	let header = 0;
	let body = 0;
	let button = 0;
	for (const component of template.components ?? []) {
		const type = String(component.type ?? "").toUpperCase();
		if (type === "HEADER" && component.format === "TEXT") {
			header = countPlaceholders(component.text);
		}
		if (type === "BODY") {
			body = countPlaceholders(component.text);
		}
		if (type === "BUTTONS" && component.buttons) {
			for (const btn of component.buttons) {
				if (btn.type === "URL" && btn.url) {
					button += countPlaceholders(btn.url);
				}
			}
		}
	}
	return { header, body, button };
}

export interface CustomerVariableField {
	key: string;
	label: string;
}

export const CUSTOMER_VARIABLE_FIELDS: CustomerVariableField[] = [
	{ key: "customer.firstName", label: "First Name" },
	{ key: "customer.lastName", label: "Last Name" },
	{ key: "customer.fullName", label: "Full Name" },
	{ key: "customer.accountNumber", label: "Account #" },
	{ key: "customer.username", label: "Username" },
	{ key: "customer.mobile", label: "Mobile" },
];

export function renderPlaceholderPreview(
	text: string | undefined,
	values: string[],
): string {
	if (!text) {
		return "";
	}
	return text.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
		const idx = Number.parseInt(n, 10) - 1;
		return values[idx] ?? `{{${n}}}`;
	});
}

export type TemplateHeaderFormat =
	| "NONE"
	| "TEXT"
	| "IMAGE"
	| "VIDEO"
	| "DOCUMENT"
	| "LOCATION";

/**
 * Pull the header descriptor out of a template. WhatsApp templates declare at
 * most one HEADER component; we use its `format` to decide whether the wizard
 * needs to collect text placeholders, a media URL, or nothing at all.
 */
export function getTemplateHeader(template: SaltiTemplate): {
	format: TemplateHeaderFormat;
	exampleMediaUrl: string | null;
} {
	const header = (template.components ?? []).find(
		(c) => String(c.type ?? "").toUpperCase() === "HEADER",
	);
	if (!header) {
		return { format: "NONE", exampleMediaUrl: null };
	}
	const format = (header.format ?? "TEXT") as TemplateHeaderFormat;
	// Meta's example media handle (cdn URL) is short-lived and won't deliver
	// reliably to real recipients, but it's good enough to pre-fill the URL
	// box so operators can swap in their own asset. Treat it as a hint.
	const exampleMediaUrl = header.example?.header_handle?.[0] ?? null;
	return { format, exampleMediaUrl };
}

export function headerFormatToMediaKind(
	format: TemplateHeaderFormat,
): "image" | "video" | "document" | null {
	if (format === "IMAGE") {
		return "image";
	}
	if (format === "VIDEO") {
		return "video";
	}
	if (format === "DOCUMENT") {
		return "document";
	}
	return null;
}
