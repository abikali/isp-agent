import { render } from "@react-email/render";
import type { Locale } from "@repo/i18n";
import { getMessagesForLocale } from "@repo/i18n";
import { mailTemplates } from "../../emails";

// Templates that use i18n translations (have entries in Messages["mail"])
type TranslatedTemplateId = keyof typeof mailTemplates;

export async function getTemplate<T extends TemplateId>({
	templateId,
	context,
	locale,
}: {
	templateId: T;
	context: Omit<
		Parameters<(typeof mailTemplates)[T]>[0],
		"locale" | "translations"
	>;
	locale: Locale;
}) {
	const template = mailTemplates[templateId];
	const translations = await getMessagesForLocale(locale);

	const email = template({
		// biome-ignore lint/suspicious/noExplicitAny: TypeScript can't infer that context matches template's expected props due to generic lookup
		...(context as any),
		locale,
		translations,
	});

	// Get subject from translations if available
	let subject = "";
	const mailTranslations =
		translations.mail[templateId as TranslatedTemplateId];
	if (mailTranslations && "subject" in mailTranslations) {
		subject = mailTranslations.subject;
	}

	const html = await render(email);
	const text = await render(email, { plainText: true });
	return { html, text, subject };
}

export type TemplateId = keyof typeof mailTemplates;
