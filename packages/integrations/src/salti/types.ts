export interface SaltiTemplateComponentExample {
	header_text?: string[];
	body_text?: string[][];
	header_handle?: string[];
}

export interface SaltiTemplateButton {
	type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
	text: string;
	url?: string;
	phone_number?: string;
	example?: string[];
}

export interface SaltiTemplateComponent {
	type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
	format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
	text?: string;
	example?: SaltiTemplateComponentExample;
	buttons?: SaltiTemplateButton[];
}

export interface SaltiTemplate {
	id?: string | number;
	name: string;
	language: string;
	status?: string;
	category?: string;
	components: SaltiTemplateComponent[];
}

export interface SaltiGroup {
	id: number | string;
	name: string;
	contactsCount?: number;
}

export interface SaltiContact {
	id: number | string;
	name?: string;
	phone: string;
	groups?: string[];
	custom?: Record<string, unknown>;
}

export interface SaltiSendTemplateInput {
	phone: string;
	template_name: string;
	template_language: string;
	components: Array<{
		type: "header" | "body" | "button";
		sub_type?: "url" | "quick_reply";
		index?: number;
		parameters: Array<
			| { type: "text"; text: string }
			| { type: "image"; image: { link: string } }
			| { type: "video"; video: { link: string } }
			| {
					type: "document";
					document: { link: string; filename?: string };
			  }
			| { type: "payload"; payload: string }
		>;
	}>;
}

export interface SaltiSendResult {
	status: "success" | "error" | string;
	message_id?: number | string;
	message_wamid?: string;
	message?: string;
	// Fields Salti returns when WhatsApp itself rejects the send (HTTP is still
	// 200; only `status: "error"` signals failure). `wa_error_code` mirrors the
	// Meta error code (e.g. 132012 for "Parameter format does not match"), and
	// `error_message` is the human-readable Meta reason.
	error_message?: string;
	wa_status?: string;
	wa_error_code?: string;
}

export interface SaltiMakeContactInput {
	phone: string;
	name?: string;
	groups?: string;
	custom?: Record<string, unknown>;
}
