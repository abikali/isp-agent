import { Avatar, AvatarFallback, AvatarImage } from "@ui/components/avatar";
import { useMemo } from "react";
import { getStorageImageUrl } from "../lib/image-utils";
import { getInitials } from "../lib/initials";

export const UserAvatar = ({
	name,
	avatarUrl,
	className,
	ref,
}: React.ComponentProps<typeof Avatar> & {
	name: string;
	avatarUrl?: string | null | undefined;
	className?: string;
}) => {
	const initials = useMemo(() => getInitials(name), [name]);

	// Build avatar URL using shared utility
	const avatarSrc = useMemo(
		() => getStorageImageUrl(avatarUrl) ?? undefined,
		[avatarUrl],
	);

	return (
		<Avatar ref={ref} className={className}>
			<AvatarImage src={avatarSrc} />
			<AvatarFallback className="bg-muted text-muted-foreground">
				{initials}
			</AvatarFallback>
		</Avatar>
	);
};

UserAvatar.displayName = "UserAvatar";
