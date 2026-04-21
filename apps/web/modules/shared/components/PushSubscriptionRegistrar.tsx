"use client";

import { useSession } from "@saas/auth/client";
import { usePushSubscription } from "@shared/hooks/use-push-subscription";

export function PushSubscriptionRegistrar() {
	const { user } = useSession();
	usePushSubscription(user?.id);
	return null;
}
