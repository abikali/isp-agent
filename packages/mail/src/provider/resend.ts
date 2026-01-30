import { config } from "@repo/config";
import { logger } from "@repo/logs";
import { Resend } from "resend";
import type { SendEmailHandler } from "../../types";

let resend: Resend | null = null;

function getResendClient(): Resend | null {
	if (resend) {
		return resend;
	}

	const apiKey = process.env["RESEND_API_KEY"];
	if (!apiKey) {
		return null;
	}

	resend = new Resend(apiKey);
	return resend;
}

const { from } = config.mails;

export const send: SendEmailHandler = async ({ to, subject, html, text }) => {
	const client = getResendClient();

	logger.info(
		`[Resend] Attempting to send email to: ${to}, subject: ${subject}`,
	);

	if (!client) {
		// Fallback to console logging in development when no API key
		logger.warn("[Resend] RESEND_API_KEY not set, logging email instead:");
		logger.log(`To: ${to}`);
		logger.log(`Subject: ${subject}`);
		logger.log(`Text: ${text}`);
		return;
	}

	const emailOptions: Parameters<typeof client.emails.send>[0] = {
		from,
		to: [to],
		subject,
		text,
	};
	if (html) {
		emailOptions.html = html;
	}

	logger.info(`[Resend] Sending email from: ${from}`);

	const result = await client.emails.send(emailOptions);

	if (result.error) {
		logger.error(
			`[Resend] Failed to send email: ${JSON.stringify(result.error)}`,
		);
		throw new Error(`Resend error: ${result.error.message}`);
	}

	logger.info(`[Resend] Email sent successfully! ID: ${result.data?.id}`);
};
