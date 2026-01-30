import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { EMAIL_QUEUE_NAME } from "../queues/email.queue";
import type { EmailJobData, EmailJobResult } from "../types";

export function createEmailWorker(): Worker<EmailJobData, EmailJobResult> {
	return new Worker<EmailJobData, EmailJobResult>(
		EMAIL_QUEUE_NAME,
		async (job: Job<EmailJobData>) => {
			const data = job.data;

			logger.info(`Processing email job ${job.id}`, {
				to: data.to,
				templateId: "templateId" in data ? data.templateId : undefined,
			});

			try {
				let success: boolean;

				// Check if this is a template email or a simple email
				if (
					"templateId" in data &&
					data.templateId &&
					"context" in data
				) {
					// Template email - cast to the correct type
					success = await sendEmail({
						to: data.to,
						locale: data.locale,
						templateId: data.templateId as Parameters<
							typeof sendEmail
						>[0] extends infer T
							? T extends { templateId: infer U }
								? U
								: never
							: never,
						context: data.context as Record<string, unknown>,
					} as Parameters<typeof sendEmail>[0]);
				} else if ("subject" in data && data.subject) {
					// Simple email with subject/body
					const emailParams: Parameters<typeof sendEmail>[0] = {
						to: data.to,
						subject: data.subject,
					};
					if (data.locale) {
						emailParams.locale = data.locale;
					}
					if (data.text) {
						emailParams.text = data.text;
					}
					if (data.html) {
						emailParams.html = data.html;
					}
					success = await sendEmail(emailParams);
				} else {
					throw new Error(
						"Invalid email job data: missing templateId or subject",
					);
				}

				if (!success) {
					throw new Error("Email sending failed");
				}

				logger.info(`Email job ${job.id} completed successfully`, {
					to: data.to,
				});
				return { success: true };
			} catch (error) {
				logger.error(`Email job ${job.id} failed`, {
					error,
					to: data.to,
				});
				throw error;
			}
		},
		{
			connection: getRedisConnection(),
			concurrency: 5,
		},
	);
}
