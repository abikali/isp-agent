"use client";
import { authClient } from "@repo/auth/client";
import { authQueryKeys, useUserPasskeysQuery } from "@saas/auth/lib/api";
import { SettingsItem } from "@saas/shared/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import { KeyIcon, PlusIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";

export function PasskeysBlock() {
	const queryClient = useQueryClient();

	const { data: passkeys, isPending } = useUserPasskeysQuery();

	const addPasskey = async () => {
		try {
			const result = await authClient.passkey.addPasskey();
			if (result && "error" in result && result.error) {
				throw result.error;
			}
			queryClient.invalidateQueries({
				queryKey: authQueryKeys.passkeys(),
			});
			toast.success("Passkey added successfully");
		} catch {
			toast.error("Failed to add passkey");
		}
	};

	const deletePasskey = (id: string) => {
		toast.promise(
			async () => {
				const { error } = await authClient.passkey.deletePasskey({
					id,
				});
				if (error) {
					throw error;
				}
				queryClient.invalidateQueries({
					queryKey: authQueryKeys.passkeys(),
				});
			},
			{
				loading: "Deleting passkey...",
				success: "Passkey deleted successfully",
				error: (error: { message?: string }) =>
					error?.message || "Failed to delete passkey",
			},
		);
	};

	return (
		<SettingsItem
			title="Passkeys"
			description="Manage your passkeys for passwordless authentication"
		>
			<div className="grid grid-cols-1 gap-2">
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
					passkeys?.map((passkey) => (
						<div key={passkey.id} className="flex gap-2">
							<KeyIcon className="size-6 shrink-0 text-primary/50" />
							<div className="flex-1">
								<strong className="block text-sm">
									{passkey.name ?? "Passkey"}
								</strong>
								<small className="block text-foreground/60 text-xs leading-tight">
									{new Date(
										passkey.createdAt,
									).toLocaleDateString()}
								</small>
							</div>
							<Button
								variant="secondary"
								size="icon"
								className="shrink-0"
								onClick={() => deletePasskey(passkey.id)}
							>
								<TrashIcon className="size-4" />
							</Button>
						</div>
					))
				)}

				<div className="flex justify-start">
					<Button variant="secondary" onClick={addPasskey}>
						<PlusIcon className="mr-1.5 size-4" />
						Add passkey
					</Button>
				</div>
			</div>
		</SettingsItem>
	);
}
