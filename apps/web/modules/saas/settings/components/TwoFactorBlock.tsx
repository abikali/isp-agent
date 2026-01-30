"use client";
import { authClient } from "@repo/auth/client";
import { useSession } from "@saas/auth/client";
import { useUserAccountsQuery } from "@saas/auth/lib/api";
import { SettingsItem } from "@saas/shared/client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Card } from "@ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { PasswordInput } from "@ui/components/password-input";
import {
	ArrowRightIcon,
	CheckIcon,
	ShieldCheckIcon,
	TabletSmartphoneIcon,
	XIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export function TwoFactorBlock() {
	const { user, reloadSession } = useSession();

	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogView, setDialogView] = useState<"password" | "totp-url">(
		"password",
	);
	const [totpURI, setTotpURI] = useState("");
	const [password, setPassword] = useState("");
	const [totpCode, setTotpCode] = useState("");

	const { data: accounts } = useUserAccountsQuery();

	// biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally reset password when dialog state changes for security
	useEffect(() => {
		setPassword("");
	}, [dialogOpen]);

	const totpURISecret = useMemo(() => {
		if (!totpURI) {
			return null;
		}

		const url = new URL(totpURI);
		return url.searchParams.get("secret") || null;
	}, [totpURI]);

	const verifyPassword = async () => {
		setDialogView("password");
		setDialogOpen(true);
	};

	const enableTwoFactorMutation = useMutation({
		mutationKey: ["enableTwoFactor"],
		mutationFn: async () => {
			const { data, error } = await authClient.twoFactor.enable({
				password,
			});

			if (error) {
				throw error;
			}

			if (data) {
				setTotpURI(data.totpURI);
			}
			setDialogView("totp-url");
		},

		onError: () => {
			toast.error("Failed to enable two-factor authentication");
		},
	});

	const disableTwoFactorMutation = useMutation({
		mutationKey: ["disableTwoFactor"],
		mutationFn: async () => {
			const { error } = await authClient.twoFactor.disable({
				password,
			});

			if (error) {
				throw error;
			}

			setDialogOpen(false);

			toast.success("Two-factor authentication disabled");

			reloadSession();
		},

		onError: () => {
			toast.error("Failed to disable two-factor authentication");
		},
	});

	const verifyTwoFactorMutation = useMutation({
		mutationKey: ["verifyTwoFactor"],
		mutationFn: async () => {
			const { error } = await authClient.twoFactor.verifyTotp({
				code: totpCode,
			});

			if (error) {
				throw error;
			}

			toast.success("Two-factor authentication enabled successfully");

			reloadSession();
			setDialogOpen(false);
		},
	});

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (user?.twoFactorEnabled) {
			disableTwoFactorMutation.mutate();
			return;
		}

		if (dialogView === "password") {
			enableTwoFactorMutation.mutate();
			return;
		}

		verifyTwoFactorMutation.mutate();
	};

	if (!accounts?.some((account) => account.providerId === "credential")) {
		return null;
	}

	return (
		<SettingsItem
			title="Two-Factor Authentication"
			description="Add an extra layer of security to your account"
		>
			{user?.twoFactorEnabled ? (
				<div className="flex items-start flex-col gap-4">
					<div className="flex items-center gap-1.5">
						<ShieldCheckIcon className="size-6 text-green-500" />
						<p className="text-sm text-foreground">
							Two-factor authentication is enabled
						</p>
					</div>
					<Button variant="secondary" onClick={verifyPassword}>
						<XIcon className="mr-1.5 size-4" />
						Disable
					</Button>
				</div>
			) : (
				<div className="flex justify-start">
					<Button variant="secondary" onClick={verifyPassword}>
						<TabletSmartphoneIcon className="mr-1.5 size-4" />
						Enable Two-Factor Authentication
					</Button>
				</div>
			)}

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{dialogView === "password"
								? "Verify Your Password"
								: "Scan QR Code"}
						</DialogTitle>
					</DialogHeader>

					{dialogView === "password" ? (
						<form onSubmit={handleSubmit}>
							<div className="grid grid-cols-1 gap-4">
								<p className="text-sm text-foreground/60">
									Please verify your password to continue
								</p>

								<div className="space-y-1.5">
									<Label className="block">Password</Label>
									<PasswordInput
										value={password}
										onChange={(value) => setPassword(value)}
									/>
								</div>
							</div>
							<div className="mt-4">
								<Button
									type="submit"
									variant="secondary"
									className="w-full"
									loading={
										enableTwoFactorMutation.isPending ||
										disableTwoFactorMutation.isPending
									}
								>
									Continue
									<ArrowRightIcon className="ml-1.5 size-4" />
								</Button>
							</div>
						</form>
					) : (
						<form onSubmit={handleSubmit}>
							<div className="grid grid-cols-1 gap-4">
								<p className="text-sm text-foreground/60">
									Scan this QR code with your authenticator
									app
								</p>
								<Card className="flex flex-col items-center gap-4 p-6">
									<QRCodeSVG value={totpURI} size={200} />

									{totpURISecret && (
										<p className="text-xs text-muted-foreground text-center">
											{totpURISecret}
										</p>
									)}
								</Card>

								<hr />

								<div className="grid grid-cols-1 gap-4">
									<div className="space-y-1.5">
										<Label className="block">
											Verification Code
										</Label>
										<Input
											value={totpCode}
											onChange={(e) =>
												setTotpCode(e.target.value)
											}
										/>
									</div>
								</div>
							</div>
							<div className="mt-4">
								<Button
									type="submit"
									variant="secondary"
									className="w-full"
									loading={verifyTwoFactorMutation.isPending}
								>
									<CheckIcon className="mr-1.5 size-4" />
									Verify
								</Button>
							</div>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</SettingsItem>
	);
}
