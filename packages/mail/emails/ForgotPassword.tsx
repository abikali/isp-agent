import { Heading, Link, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";
import PrimaryButton from "../src/components/PrimaryButton";
import Wrapper from "../src/components/Wrapper";
import { defaultLocale, defaultTranslations } from "../src/util/translations";
import type { BaseMailProps } from "../types";

export function ForgotPassword({
	url,
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
		<Wrapper previewText="Reset your LibanCom password">
			<Heading className="m-0 mb-4 text-2xl font-bold text-foreground">
				Reset your password
			</Heading>

			<Text className="text-base text-foreground">
				{t("mail.forgotPassword.body")}
			</Text>

			<Text className="text-base text-foreground">
				Click the button below to create a new password. This link will
				expire in 1 hour.
			</Text>

			<div className="my-6 text-center">
				<PrimaryButton href={url}>
					{t("mail.forgotPassword.resetPassword")} →
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
				If you didn't request a password reset, you can safely ignore
				this email. Your password will remain unchanged.
			</Text>
		</Wrapper>
	);
}

ForgotPassword.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	url: "https://libancom.co/reset-password?token=abc123",
	name: "John",
};

export default ForgotPassword;
