"use client";
import { authClient } from "@repo/auth/client";
import { config } from "@repo/config";
import { useSession } from "@saas/auth/client";
import { authQueryKeys } from "@saas/auth/lib/api";
import { SettingsItem } from "@saas/shared/client";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import {
	ChromeIcon,
	GlobeIcon,
	LogOutIcon,
	MonitorIcon,
	SmartphoneIcon,
	TabletIcon,
	XIcon,
} from "lucide-react";
import { toast } from "sonner";

function getBrowserIcon(browser: string) {
	switch (browser.toLowerCase()) {
		case "chrome":
			return ChromeIcon;
		case "safari":
		case "firefox":
		case "edge":
		case "opera":
			return GlobeIcon;
		default:
			return GlobeIcon;
	}
}

function getDeviceIcon(device: string) {
	switch (device.toLowerCase()) {
		case "mobile":
			return SmartphoneIcon;
		case "tablet":
			return TabletIcon;
		default:
			return MonitorIcon;
	}
}

export function ActiveSessionsBlock() {
	const queryClient = useQueryClient();
	const { session: currentSession } = useSession();

	const { data: sessions, isPending } = useQuery(
		orpc.sessions.list.queryOptions({
			input: {
				currentSessionToken: currentSession?.token,
			},
		}),
	);

	const revokeAllOthersMutation = useMutation(
		orpc.sessions.revokeAllOthers.mutationOptions(),
	);

	const revokeSession = (token: string) => {
		authClient.revokeSession(
			{
				token,
			},
			{
				onSuccess: async () => {
					toast.success("Session revoked successfully");

					if (currentSession?.token === token) {
						await queryClient.refetchQueries({
							queryKey: authQueryKeys.session(),
						});

						window.location.href = new URL(
							config.auth.redirectAfterLogout,
							window.location.origin,
						).toString();
					} else {
						queryClient.invalidateQueries({
							queryKey: orpc.sessions.list.key(),
						});
					}
				},
			},
		);
	};

	const handleRevokeAllOthers = async () => {
		if (!currentSession?.token) {
			return;
		}

		try {
			await revokeAllOthersMutation.mutateAsync({
				currentSessionToken: currentSession.token,
			});
			toast.success("All other sessions revoked successfully");
			queryClient.invalidateQueries({
				queryKey: orpc.sessions.list.key(),
			});
		} catch {
			toast.error("Failed to revoke sessions");
		}
	};

	const otherSessionsCount =
		sessions?.filter((s) => !s.isCurrent).length ?? 0;

	return (
		<SettingsItem
			title="Active Sessions"
			description="Manage your active sessions across devices"
		>
			<div className="space-y-4">
				{otherSessionsCount > 0 && (
					<div className="flex justify-end">
						<Button
							variant="outline"
							size="sm"
							onClick={handleRevokeAllOthers}
							disabled={revokeAllOthersMutation.isPending}
						>
							<LogOutIcon className="mr-2 size-4" />
							Sign Out All Other Sessions
						</Button>
					</div>
				)}

				<div className="grid grid-cols-1 gap-3">
					{isPending ? (
						<div className="flex gap-2">
							<Skeleton className="size-6 shrink-0" />
							<div className="flex-1">
								<Skeleton className="mb-0.5 h-4 w-full" />
								<Skeleton className="h-8 w-full" />
							</div>
							<Skeleton className="size-9 shrink-0" />
						</div>
					) : (
						sessions?.map((session) => {
							const DeviceIcon = getDeviceIcon(session.device);
							const BrowserIcon = getBrowserIcon(session.browser);

							return (
								<div
									key={session.id}
									className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
								>
									<div className="flex gap-3">
										<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
											<DeviceIcon className="size-5 text-muted-foreground" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<strong className="text-sm">
													{session.browser} on{" "}
													{session.os}
												</strong>
												{session.isCurrent && (
													<Badge
														variant="secondary"
														className="text-xs"
													>
														Current Session
													</Badge>
												)}
												{session.isImpersonated && (
													<Badge
														variant="destructive"
														className="text-xs"
													>
														Impersonated
													</Badge>
												)}
											</div>
											<div className="flex items-center gap-2 text-muted-foreground text-xs">
												<BrowserIcon className="size-3" />
												<span>{session.device}</span>
												{session.ipAddress && (
													<>
														<span>•</span>
														<span>
															{session.ipAddress}
														</span>
													</>
												)}
											</div>
											<small className="block text-muted-foreground text-xs">
												Created on{" "}
												{new Date(
													session.createdAt,
												).toLocaleDateString()}
											</small>
										</div>
									</div>
									{!session.isCurrent && (
										<Button
											variant="ghost"
											size="icon"
											className="shrink-0 text-muted-foreground hover:text-destructive"
											onClick={() =>
												revokeSession(session.id)
											}
										>
											<XIcon className="size-4" />
										</Button>
									)}
								</div>
							);
						})
					)}
				</div>
			</div>
		</SettingsItem>
	);
}
