import type {
	SaltiGroup,
	SaltiMakeContactInput,
	SaltiSendResult,
	SaltiSendTemplateInput,
	SaltiTemplate,
} from "./types";

export interface SaltiClientConfig {
	endpoint: string;
	token: string;
}

export class SaltiApiError extends Error {
	status: number;
	body: unknown;
	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = "SaltiApiError";
		this.status = status;
		this.body = body;
	}
}

function joinUrl(base: string, path: string): string {
	const trimmedBase = base.replace(/\/+$/, "");
	const trimmedPath = path.replace(/^\/+/, "");
	return `${trimmedBase}/${trimmedPath}`;
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
	const text = await res.text();
	let json: unknown;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		throw new SaltiApiError(
			`Salti returned non-JSON response (${res.status})`,
			res.status,
			text,
		);
	}
	if (!res.ok) {
		throw new SaltiApiError(
			typeof json === "object" &&
				json !== null &&
				"message" in json &&
				typeof (json as { message: unknown }).message === "string"
				? (json as { message: string }).message
				: `Salti request failed (${res.status})`,
			res.status,
			json,
		);
	}
	return json;
}

export function createSaltiClient(config: SaltiClientConfig) {
	const { endpoint, token } = config;

	async function get(path: string, params: Record<string, string> = {}) {
		const url = new URL(joinUrl(endpoint, path));
		url.searchParams.set("token", token);
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}
		const res = await fetch(url.toString(), { method: "GET" });
		return parseJsonOrThrow(res);
	}

	async function postJson(path: string, body: Record<string, unknown>) {
		const url = joinUrl(endpoint, path);
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, ...body }),
		});
		return parseJsonOrThrow(res);
	}

	return {
		async getTemplates(): Promise<SaltiTemplate[]> {
			const result = (await get("api/wpbox/getTemplates")) as
				| SaltiTemplate[]
				| { data?: SaltiTemplate[]; templates?: SaltiTemplate[] };
			const list: SaltiTemplate[] = Array.isArray(result)
				? result
				: result && Array.isArray(result.data)
					? result.data
					: result && Array.isArray(result.templates)
						? result.templates
						: [];
			// Salti returns `components` as a JSON-encoded string; normalize to array.
			return list.map((t) => {
				const raw = (t as unknown as { components: unknown })
					.components;
				if (typeof raw === "string") {
					try {
						return {
							...t,
							components: JSON.parse(
								raw,
							) as SaltiTemplate["components"],
						};
					} catch {
						return { ...t, components: [] };
					}
				}
				return t;
			});
		},

		async getGroups(): Promise<SaltiGroup[]> {
			const result = (await get("api/wpbox/getGroups", {
				showContacts: "no",
			})) as
				| SaltiGroup[]
				| { data?: SaltiGroup[]; groups?: SaltiGroup[] };
			if (Array.isArray(result)) {
				return result;
			}
			if (result && Array.isArray(result.data)) {
				return result.data;
			}
			if (result && Array.isArray(result.groups)) {
				return result.groups;
			}
			return [];
		},

		async getContacts(): Promise<unknown> {
			return get("api/wpbox/getContacts");
		},

		async sendTemplateMessage(
			input: SaltiSendTemplateInput,
		): Promise<SaltiSendResult> {
			const result = (await postJson(
				"api/wpbox/sendtemplatemessage",
				input as unknown as Record<string, unknown>,
			)) as SaltiSendResult;
			return result;
		},

		async makeContact(input: SaltiMakeContactInput): Promise<unknown> {
			return postJson(
				"api/wpbox/makeContact",
				input as unknown as Record<string, unknown>,
			);
		},
	};
}

export type SaltiClient = ReturnType<typeof createSaltiClient>;
