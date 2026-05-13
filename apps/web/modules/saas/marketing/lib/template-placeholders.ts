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
