import { Heading, Link, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";
import PrimaryButton from "../src/components/PrimaryButton";
import Wrapper from "../src/components/Wrapper";
import { defaultLocale, defaultTranslations } from "../src/util/translations";
import type { BaseMailProps } from "../types";

export function OrganizationInvitation({
	url,
	organizationName,
	locale,
	translations,
}: {
	url: string;
	organizationName: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: translations,
	});

	return (
		<Wrapper
			previewText={`You've been invited to join ${organizationName} on LibanCom`}
		>
			<Heading className="m-0 mb-4 text-2xl font-bold text-foreground">
				You're invited! 🎉
			</Heading>

			<Text className="text-base text-foreground">
				You've been invited to join <strong>{organizationName}</strong>{" "}
				on LibanCom.
			</Text>

			<Text className="text-base text-foreground">
				{t("mail.organizationInvitation.body", { organizationName })}
			</Text>

			<div className="my-6 text-center">
				<PrimaryButton href={url}>
					{t("mail.organizationInvitation.join")} →
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
				This invitation will expire in 7 days. If you don't want to join
				this organization, you can safely ignore this email.
			</Text>
		</Wrapper>
	);
}

OrganizationInvitation.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	url: "https://libancom.co/invite?token=abc123",
	organizationName: "Acme Corp",
};

export default OrganizationInvitation;
