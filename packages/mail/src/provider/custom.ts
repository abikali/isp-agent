import type { SendEmailHandler } from "../../types";

// Custom email provider template
// Available params: to, subject, text, html
// Config available via: import { config } from "@repo/config"; config.mails.from
export const send: SendEmailHandler = async (_params) => {
	// Implement your custom email sending logic here
	// Example:
	// const { to, subject, text, html } = _params;
	// await yourEmailService.send({ from: config.mails.from, to, subject, text, html });
};
