import type { config } from "@repo/config";
import { getEmailQueue } from "../queues/email.queue";
import type { EmailJobData } from "../types";

/**
 * Queue an email for async sending
 */
export async function queueEmail(data: EmailJobData): Promise<string> {
	const queue = getEmailQueue();
	const job = await queue.add("send-email", data);
	return job.id ?? "";
}

/**
 * Queue a templated email for async sending
 */
export async function queueTemplateEmail<T extends string>(params: {
	to: string;
	locale?: keyof typeof config.i18n.locales;
	templateId: T;
	context: Record<string, unknown>;
}): Promise<string> {
	const jobData: EmailJobData = {
		to: params.to,
		templateId: params.templateId,
		context: params.context,
	};
	if (params.locale) {
		jobData.locale = params.locale;
	}
	return queueEmail(jobData);
}

/**
 * Queue a simple email for async sending
 */
export async function queueSimpleEmail(params: {
	to: string;
	subject: string;
	text?: string;
	html?: string;
	locale?: keyof typeof config.i18n.locales;
}): Promise<string> {
	const jobData: EmailJobData = {
		to: params.to,
		subject: params.subject,
	};
	if (params.text) {
		jobData.text = params.text;
	}
	if (params.html) {
		jobData.html = params.html;
	}
	if (params.locale) {
		jobData.locale = params.locale;
	}
	return queueEmail(jobData);
}
