import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { MailCheckIcon } from "lucide-react";

export function OrganizationInvitationAlert({
	className,
}: {
	className?: string;
}) {
	return (
		<Alert variant="primary" className={className}>
			<MailCheckIcon />
			<AlertTitle>You have pending invitations</AlertTitle>
			<AlertDescription>
				You have been invited to join one or more organizations. Check
				your invitations below.
			</AlertDescription>
		</Alert>
	);
}
