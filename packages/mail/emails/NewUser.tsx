import { Heading, Link, Section, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";
import PrimaryButton from "../src/components/PrimaryButton";
import Wrapper from "../src/components/Wrapper";
import { defaultLocale, defaultTranslations } from "../src/util/translations";
import type { BaseMailProps } from "../types";

export function NewUser({
	url,
	name,
	otp,
	locale,
	translations,
}: {
	url: string;
	name: string;
	otp: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: translations,
	});

	return (
		<Wrapper
			previewText={`Welcome to LibanCom, ${name}! Verify your email to get started.`}
		>
			<Heading className="m-0 mb-4 text-2xl font-bold text-foreground">
				Welcome to LibanCom! 🎉
			</Heading>

			<Text className="text-base text-foreground">
				{t("mail.newUser.body", { name })}
			</Text>

			<Section className="my-6 rounded-lg bg-muted p-6 text-center">
				<Text className="m-0 mb-2 text-muted-foreground text-sm font-medium">
					{t("mail.common.otp")}
				</Text>
				<Text className="m-0 font-mono text-3xl font-bold tracking-widest text-foreground">
					{otp}
				</Text>
			</Section>

			<Text className="text-base text-foreground">
				{t("mail.common.useLink")}
			</Text>

			<div className="my-6 text-center">
				<PrimaryButton href={url}>
					{t("mail.newUser.confirmEmail")} →
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
		</Wrapper>
	);
}

NewUser.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	url: "https://libancom.co/verify?token=abc123",
	name: "John",
	otp: "123456",
};

export default NewUser;
