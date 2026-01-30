import type { Locale, Messages } from "@repo/i18n";

export interface SendEmailParams {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

export type SendEmailHandler = (params: SendEmailParams) => Promise<void>;

export interface MailProvider {
	send: SendEmailHandler;
}

export interface BaseMailProps {
	locale: Locale;
	translations: Messages;
}
