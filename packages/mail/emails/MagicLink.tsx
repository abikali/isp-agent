import { Heading, Link, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";
import PrimaryButton from "../src/components/PrimaryButton";
import Wrapper from "../src/components/Wrapper";
import { defaultLocale, defaultTranslations } from "../src/util/translations";
import type { BaseMailProps } from "../types";

export function MagicLink({
	url,
	locale,
	translations,
}: {
	url: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: translations,
	});

	return (
		<Wrapper previewText="Your LibanCom login link">
			<Heading className="m-0 mb-4 text-2xl font-bold text-foreground">
				Sign in to LibanCom
			</Heading>

			<Text className="text-base text-foreground">
				{t("mail.magicLink.body")}
			</Text>

			<Text className="text-base text-foreground">
				{t("mail.common.useLink")}
			</Text>

			<div className="my-6 text-center">
				<PrimaryButton href={url}>
					{t("mail.magicLink.login")} →
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
				This link will expire in 15 minutes. If you didn't request this
				login link, you can safely ignore this email.
			</Text>
		</Wrapper>
	);
}

MagicLink.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	url: "https://libancom.co/magic-link?token=abc123",
};

export default MagicLink;
