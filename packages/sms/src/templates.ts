/**
 * Customer SMS texts (Arabic, sent as UCS-2: 70 chars per segment, 67 when
 * concatenated). `{{phone}}` is the collector / office number, already
 * formatted for display (e.g. `76878870`).
 */

/** Day-before-expiry reminder for an unpaid invoice (~123 chars, 2 segments). */
export const EXPIRY_REMINDER_SMS =
	"Libancom: موعد تجديد اشتراك الإنترنت غدًا. يرجى التواصل مع جابي الاشتراك على {{phone}} لتسديد الاشتراك وتفادي انقطاع الخدمة.";

/** Pending stop request: the collector is trying to reach the customer (~109 chars, 2 segments). */
export const STOP_NOTICE_SMS =
	"Libancom: موظف الجباية يحاول التواصل معكم لتجديد الاشتراك. يرجى الاتصال به على {{phone}} لتفادي انقطاع الخدمة.";

export const SMS_TEMPLATES = {
	expiry_reminder: EXPIRY_REMINDER_SMS,
	stop_notice: STOP_NOTICE_SMS,
} as const;

export type SmsTemplateKey = keyof typeof SMS_TEMPLATES;
