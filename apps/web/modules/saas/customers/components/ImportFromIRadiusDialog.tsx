"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { useOrganizationId } from "@shared/lib/organization";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { useState } from "react";
import { toast } from "sonner";
import { useImportFromIRadius } from "../hooks/use-customers";

export function ImportFromIRadiusDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const { activeOrganization } = useActiveOrganization();
	const router = useRouter();
	const [username, setUsername] = useState("");
	const importFromIRadius = useImportFromIRadius();

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!organizationId || !activeOrganization) {
			return;
		}
		const trimmed = username.trim();
		if (!trimmed) {
			return;
		}
		toast.promise(
			importFromIRadius.mutateAsync({
				organizationId,
				username: trimmed,
			}),
			{
				loading: `Importing "${trimmed}" from iRadius...`,
				success: ({ customerId }) => {
					onOpenChange(false);
					setUsername("");
					router.navigate({
						to: "/app/$organizationSlug/customers/$customerId",
						params: {
							organizationSlug: activeOrganization.slug,
							customerId,
						},
					});
					return "Customer imported";
				},
				error: (err: { message?: string }) =>
					err?.message ?? "Failed to import customer",
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import from iRadius</DialogTitle>
					<DialogDescription>
						Fetch a single customer from iRadius by username without
						running a full sync.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="iradius-username">
							iRadius username
						</Label>
						<Input
							id="iradius-username"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="e.g. josephsrour"
							autoFocus
							required
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								importFromIRadius.isPending || !username.trim()
							}
						>
							{importFromIRadius.isPending
								? "Importing..."
								: "Import"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
