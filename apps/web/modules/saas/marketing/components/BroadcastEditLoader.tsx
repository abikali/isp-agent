"use client";

import { useBroadcast } from "../hooks/use-marketing";
import { BroadcastWizard } from "./BroadcastWizard";

interface BroadcastEditLoaderProps {
	broadcastId: string;
	organizationSlug: string;
}

export function BroadcastEditLoader({
	broadcastId,
	organizationSlug,
}: BroadcastEditLoaderProps) {
	const { broadcast } = useBroadcast(broadcastId);
	if (!broadcast) {
		return null;
	}
	return (
		<BroadcastWizard
			organizationSlug={organizationSlug}
			mode="edit"
			initial={{
				broadcastId: broadcast.id,
				name: broadcast.name,
				templateName: broadcast.templateName,
				templateLang: broadcast.templateLang,
				audience: broadcast.audienceConfig,
				variables: broadcast.variables as never,
			}}
		/>
	);
}
