"use client";
import { authClient } from "@repo/auth/client";
import { config } from "@repo/config";
import { type OAuthProvider, oAuthProviders } from "@saas/auth";
import { useUserAccountsQuery } from "@saas/auth/lib/api";
import { SettingsItem } from "@saas/shared/client";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import { CheckCircle2Icon, LinkIcon } from "lucide-react";

export function ConnectedAccountsBlock() {
	const { data, isPending } = useUserAccountsQuery();

	// Don't render if social login is disabled
	if (!config.auth.enableSocialLogin) {
		return null;
	}

	const isProviderLinked = (provider: OAuthProvider) =>
		data?.some((account) => account.providerId === provider);

	const linkProvider = (provider: OAuthProvider) => {
		const callbackURL = window.location.href;
		if (!isProviderLinked(provider)) {
			authClient.linkSocial({
				provider,
				callbackURL,
			});
		}
	};

	return (
		<SettingsItem title="Connected Accounts">
			<div className="grid grid-cols-1 divide-y">
				{Object.entries(oAuthProviders).map(
					([provider, providerData]) => {
						const isLinked = isProviderLinked(
							provider as OAuthProvider,
						);

						return (
							<div
								key={provider}
								className="flex h-14 items-center justify-between gap-2 py-2"
							>
								<div className="flex items-center gap-2">
									<providerData.icon className="size-4 text-primary/50" />
									<span className="text-sm">
										{providerData.name}
									</span>
								</div>
								{isPending ? (
									<Skeleton className="h-10 w-28" />
								) : isLinked ? (
									<CheckCircle2Icon className="size-6 text-success" />
								) : (
									<Button
										variant={
											isLinked ? "outline" : "secondary"
										}
										onClick={() =>
											linkProvider(
												provider as OAuthProvider,
											)
										}
									>
										<LinkIcon className="mr-1.5 size-4" />
										<span>Connect</span>
									</Button>
								)}
							</div>
						);
					},
				)}
			</div>
		</SettingsItem>
	);
}
