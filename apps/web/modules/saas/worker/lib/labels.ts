import { bilingual } from "@repo/utils";

/**
 * Field-crew copy for the worker portal forms, as "English · العربية".
 *
 * Kept in one table so the translations can be reviewed (and corrected by
 * the owner) in one place. "Installed items" and "recovered" use Jhonny's
 * own wording verbatim (2026-09-12). Customer = زبون, base = قاعدة,
 * station = محطة.
 */
const STRINGS = {
	// Task list
	searchTasks: ["Search task, customer, phone…", "ابحث عن مهمة، زبون، هاتف…"],
	search: ["Search…", "بحث…"],
	statusOpen: ["Open", "مفتوحة"],
	statusCompleted: ["Completed", "منجزة"],
	statusCancelled: ["Cancelled", "ملغاة"],
	statusPendingApproval: ["Awaiting approval", "بانتظار الموافقة"],
	statusAll: ["All statuses", "كل الحالات"],
	allTypes: ["All types", "كل الأنواع"],
	sortNewest: ["Newest first", "الأحدث أولاً"],
	sortOldest: ["Oldest first", "الأقدم أولاً"],
	sortPriority: ["Priority", "الأولوية"],
	noTasks: ["No tasks match your filters.", "لا توجد مهام مطابقة."],
	priorityHigh: ["High", "عالية"],
	priorityUrgent: ["Urgent", "عاجلة"],
	directions: ["Directions", "الاتجاهات"],
	setUp: ["Set up", "للتركيب"],
	confirmAddons: [
		"Confirm on the customer when you complete the task.",
		"أكّدها على الزبون عند إنهاء المهمة.",
	],
	due: ["Due", "الموعد"],
	overdue: ["overdue", "متأخرة"],
	submit: ["Submit", "إرسال"],
	showAllTasks: ["Show all my tasks", "عرض كل مهامي"],

	// Submit sheets
	complete: ["Complete", "إنهاء"],
	completeTask: ["Complete task", "إنهاء المهمة"],
	install: ["Install", "تركيب"],
	submitInstallation: ["Submit installation", "إرسال التركيب"],
	replacement: ["Replacement", "استبدال"],
	submitReplacement: ["Submit replacement", "إرسال الاستبدال"],
	submitForReview: ["Submit for review", "إرسال للمراجعة"],
	submitting: ["Submitting…", "جارٍ الإرسال…"],
	whatDidYouFind: ["What did you find?", "ما المشكلة التي وجدتها؟"],
	note: ["Note", "ملاحظة"],
	noteOptional: ["Note (optional)", "ملاحظة (اختياري)"],
	notePlaceholder: ["Anything worth noting?", "هل من ملاحظة؟"],
	itemsAndAddons: ["Items & add-ons", "الأغراض والخدمات الإضافية"],
	itemsUsedOptional: ["Items used (optional)", "الأغراض المستعملة (اختياري)"],
	installedItems: ["Installed items", "الاغراض التي تم تركيبها"],
	newInstalledItems: ["New installed items", "الاغراض التي تم تركيبها"],
	recoveredEquipment: ["Recovered equipment", "اغراض تم فكها"],
	recoveredEquipmentOptional: [
		"Recovered equipment (optional)",
		"اغراض تم فكها (اختياري)",
	],
	recoveredOldEquipment: ["Recovered (old) equipment", "اغراض تم فكها"],
	photo: ["Photo", "صورة"],
	photoOptional: ["Photo (optional)", "صورة (اختياري)"],
	installPhoto: ["Install photo", "صورة التركيب"],
	photoEvidence: ["Photo evidence", "صورة إثبات"],
	noteRequiredForOther: [
		"A note is required for 'Other'",
		"الملاحظة مطلوبة عند اختيار «أخرى»",
	],
	taskCompleted: ["Task completed", "تم إنهاء المهمة"],
	installationSubmitted: [
		"Installation submitted for approval",
		"تم إرسال التركيب للموافقة",
	],
	replacementSubmitted: [
		"Replacement submitted for approval",
		"تم إرسال الاستبدال للموافقة",
	],
	recoveredSubmitted: [
		"Recovered items submitted for review",
		"تم إرسال الاغراض التي تم فكها للمراجعة",
	],
	failedToSubmit: ["Failed to submit", "فشل الإرسال"],
	failedToSendRefund: [
		"Failed to send refund request",
		"فشل إرسال طلب الإرجاع",
	],
	invalidInput: [
		"Some fields are missing or invalid — check the form",
		"بعض الحقول ناقصة أو غير صحيحة — راجع النموذج",
	],

	// Item rows
	item: ["Item", "الغرض"],
	addon: ["Add-on", "خدمة إضافية"],
	selectItem: ["Select an item…", "اختر غرضاً…"],
	searchItems: ["Search items…", "ابحث عن غرض…"],
	pickFromMyStock: ["Pick from my stock", "اختر من مخزوني"],
	searchMyStock: ["Search my stock…", "ابحث في مخزوني…"],
	noStockItems: ["No stock items", "لا يوجد أغراض في مخزونك"],
	addonType: ["Add-on type", "نوع الخدمة الإضافية"],
	quantity: ["Quantity", "الكمية"],
	qty: ["Qty", "الكمية"],
	price: ["Price ($)", "السعر ($)"],
	monthlyPrice: ["Monthly price ($)", "السعر الشهري ($)"],
	addItem: ["Add item", "إضافة غرض"],
	addAddon: ["Add add-on", "إضافة خدمة إضافية"],
	addRecoveredItem: ["Add recovered item", "إضافة غرض تم فكه"],
	addAnotherItem: ["Add another item", "إضافة غرض آخر"],
	total: ["Total", "المجموع"],

	// Photo capture
	addPhoto: ["Add photo", "إضافة صورة"],
	uploading: ["Uploading…", "جارٍ الرفع…"],
	uploadFailed: ["Upload failed", "فشل الرفع"],

	// Pager
	prev: ["Prev", "السابق"],
	next: ["Next", "التالي"],

	// Phone actions
	call: ["Call", "اتصال"],
	whatsApp: ["WhatsApp", "واتساب"],
	whichNumberToCall: [
		"Which number do you want to call?",
		"أي رقم تريد أن تتصل به؟",
	],
	whichNumberToMessage: [
		"Which number do you want to message?",
		"أي رقم تريد أن تراسل؟",
	],
} as const satisfies Record<string, readonly [string, string]>;

export type FieldLabelKey = keyof typeof STRINGS;

export const FIELD_LABELS = Object.fromEntries(
	Object.entries(STRINGS).map(([key, [en, ar]]) => [key, bilingual(en, ar)]),
) as Record<FieldLabelKey, string>;

/**
 * Toast text for a failed field-crew request. Server messages written for
 * the field team are already bilingual; the generic ones every procedure
 * shares — permission refusals and input validation — are English-only
 * server side (admins read them too), so they get their Arabic here.
 */
export function fieldErrorMessage(error: unknown, fallback: string): string {
	if (!(error instanceof Error)) {
		return fallback;
	}
	const code = (error as { code?: unknown }).code;
	if (code === "FORBIDDEN" && !error.message.includes("\u2068")) {
		return bilingual(error.message, "ليس لديك صلاحية للقيام بهذا");
	}
	if (code === "BAD_REQUEST" && error.message === "Input validation failed") {
		return FIELD_LABELS.invalidInput;
	}
	return error.message || fallback;
}
