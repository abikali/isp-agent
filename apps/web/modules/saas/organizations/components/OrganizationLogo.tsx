"use client";

import { useIsClient } from "@shared/hooks/use-is-client";
import { getStorageImageUrl } from "@shared/lib/image-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/components/avatar";
import BoringAvatar from "boring-avatars";
import { useMemo } from "react";

export const OrganizationLogo = ({
	name,
	logoUrl,
	className,
	ref,
}: React.ComponentProps<typeof Avatar> & {
	name: string;
	logoUrl?: string | null | undefined;
	className?: string;
}) => {
	const isClient = useIsClient();
	const avatarColors = useMemo(() => {
		if (typeof window === "undefined") {
			return [];
		}

		const styles = getComputedStyle(window.document.documentElement);
		return [
			styles.getPropertyValue("--color-primary"),
			styles.getPropertyValue("--color-accent"),
			styles.getPropertyValue("--color-highlight"),
		];
	}, []);

	// Build logo URL using shared utility
	const logoSrc = useMemo(
		() => getStorageImageUrl(logoUrl) ?? undefined,
		[logoUrl],
	);

	if (!isClient) {
		return null;
	}

	return (
		<Avatar ref={ref} className={className}>
			<AvatarImage src={logoSrc} />
			<AvatarFallback>
				<BoringAvatar
					size={96}
					name={name}
					variant="sunset"
					colors={avatarColors}
					square
				/>
			</AvatarFallback>
		</Avatar>
	);
};

OrganizationLogo.displayName = "OrganizationLogo";
