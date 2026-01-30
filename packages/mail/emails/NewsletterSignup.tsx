import { Heading, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";
import Wrapper from "../src/components/Wrapper";
import { defaultLocale, defaultTranslations } from "../src/util/translations";
import type { BaseMailProps } from "../types";

export function NewsletterSignup({ locale, translations }: BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: translations,
	});

	return (
		<Wrapper previewText="You're subscribed to LibanCom updates!">
			<Heading className="m-0 mb-4 text-2xl font-bold text-foreground">
				{t("mail.newsletterSignup.subject")}
			</Heading>

			<Text className="text-base text-foreground">
				{t("mail.newsletterSignup.body")}
			</Text>

			<Text className="text-base text-foreground">Stay tuned for:</Text>

			<Text className="text-base text-foreground">
				• New features and product updates{"\n"}• Tips for getting the
				most out of LibanCom{"\n"}• Industry insights on digital
				networking
			</Text>

			<Text className="mt-6 text-muted-foreground text-sm">
				You can unsubscribe at any time by clicking the link in any of
				our emails.
			</Text>
		</Wrapper>
	);
}

NewsletterSignup.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
};

export default NewsletterSignup;
