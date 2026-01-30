import { Heading, Link, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";
import PrimaryButton from "../src/components/PrimaryButton";
import Wrapper from "../src/components/Wrapper";
import { defaultLocale, defaultTranslations } from "../src/util/translations";
import type { BaseMailProps } from "../types";

export function EmailVerification({
	url,
	name,
	locale,
	translations,
}: {
	url: string;
	name: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: translations,
	});

	return (
		<Wrapper previewText="Verify your email to get started with LibanCom">
			<Heading className="m-0 mb-4 text-2xl font-bold text-foreground">
				{t("mail.emailVerification.headline")}
			</Heading>

			<Text className="text-base text-foreground">
				{t("mail.emailVerification.body", { name })}
			</Text>

			<Text className="text-base text-foreground">
				Click the button below to verify your email address and activate
				your account.
			</Text>

			<div className="my-6 text-center">
				<PrimaryButton href={url}>
					{t("mail.emailVerification.confirmEmail")} →
				</PrimaryButton>
			</div>

			<Text className="text-muted-foreground text-sm">
				{t("mail.common.openLinkInBrowser")}
			</Text>
			<Text className="m-0 text-muted-foreground text-sm">
				<Link href={url} className="break-all text-accent underline">
					{url}
				</Link>
			</Text>

			<Text className="mt-6 text-muted-foreground text-sm">
				If you didn't create an account with LibanCom, you can safely
				ignore this email.
			</Text>
		</Wrapper>
	);
}

EmailVerification.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	url: "https://libancom.co/verify?token=abc123",
	name: "John",
};

export default EmailVerification;
