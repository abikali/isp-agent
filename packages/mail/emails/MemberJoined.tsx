import { Heading, Link, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";
import PrimaryButton from "../src/components/PrimaryButton";
import Wrapper from "../src/components/Wrapper";
import { defaultLocale, defaultTranslations } from "../src/util/translations";
import type { BaseMailProps } from "../types";

export function MemberJoined({
	memberName,
	organizationName,
	viewUrl,
	locale,
	translations,
}: {
	memberName: string;
	organizationName: string;
	viewUrl: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: translations,
	});

	return (
		<Wrapper previewText={`${memberName} just joined ${organizationName}`}>
			<Heading className="m-0 mb-4 text-2xl font-bold text-foreground">
				{t("mail.memberJoined.headline")} 👋
			</Heading>

			<Text className="text-base text-foreground">
				Great news! <strong>{memberName}</strong> has joined your team
				at <strong>{organizationName}</strong>.
			</Text>

			<Text className="text-base text-foreground">
				{t("mail.memberJoined.body", { memberName, organizationName })}
			</Text>

			<div className="my-6 text-center">
				<PrimaryButton href={viewUrl}>
					{t("mail.memberJoined.viewTeam")} →
				</PrimaryButton>
			</div>

			<Text className="text-muted-foreground text-sm">
				{t("mail.common.openLinkInBrowser")}
			</Text>
			<Text className="m-0 text-muted-foreground text-sm">
				<Link
					href={viewUrl}
					className="break-all text-accent underline"
				>
					{viewUrl}
				</Link>
			</Text>
		</Wrapper>
	);
}

MemberJoined.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	memberName: "John Doe",
	organizationName: "Acme Corp",
	viewUrl: "https://libancom.co/app/acme/settings/members",
};

export default MemberJoined;
