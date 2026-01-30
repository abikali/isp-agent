"use client";

import { useConfirmationAlert } from "@saas/shared/client";
import { Spinner } from "@shared/components/Spinner";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card } from "@ui/components/card";
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
import { Slider } from "@ui/components/slider";
import { Switch } from "@ui/components/switch";
import { Textarea } from "@ui/components/textarea";
import { PencilIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { FeatureFlag } from "../../lib/types";

export function FeatureFlagsList() {
	const queryClient = useQueryClient();
	const { confirm } = useConfirmationAlert();
	const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
	const [searchTerm, setSearchTerm] = useState("");

	const { data: flags, isLoading } = useQuery(
		orpc.featureFlags.list.queryOptions({
			input: {},
		}),
	);

	const updateMutation = useMutation(
		orpc.featureFlags.update.mutationOptions(),
	);
	const deleteMutation = useMutation(
		orpc.featureFlags.delete.mutationOptions(),
	);

	const handleToggle = async (flag: FeatureFlag) => {
		try {
			await updateMutation.mutateAsync({
				key: flag.key,
				enabled: !flag.enabled,
			});

			queryClient.invalidateQueries({
				queryKey: orpc.featureFlags.list.key(),
			});

			toast.success("Feature flag updated successfully");
		} catch {
			toast.error("Failed to update feature flag");
		}
	};

	const handleDelete = async (key: string) => {
		try {
			await deleteMutation.mutateAsync({ key });

			queryClient.invalidateQueries({
				queryKey: orpc.featureFlags.list.key(),
			});

			toast.success("Feature flag deleted successfully");
		} catch {
			toast.error("Failed to delete feature flag");
		}
	};

	const handleUpdate = async () => {
		if (!editingFlag) {
			return;
		}

		try {
			await updateMutation.mutateAsync({
				key: editingFlag.key,
				name: editingFlag.name,
				description: editingFlag.description,
				enabled: editingFlag.enabled,
				percentage: editingFlag.percentage,
				targetUsers: editingFlag.targetUsers,
				targetOrgs: editingFlag.targetOrgs,
			});

			queryClient.invalidateQueries({
				queryKey: orpc.featureFlags.list.key(),
			});

			toast.success("Feature flag updated successfully");
			setEditingFlag(null);
		} catch {
			toast.error("Failed to update feature flag");
		}
	};

	const filteredFlags = flags?.filter(
		(flag) =>
			flag.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
			flag.name.toLowerCase().includes(searchTerm.toLowerCase()),
	);

	if (isLoading) {
		return (
			<Card className="p-6">
				<div className="flex items-center justify-center py-8">
					<Spinner className="mr-2 size-4 text-primary" />
					Loading...
				</div>
			</Card>
		);
	}

	return (
		<>
			<Card className="p-6">
				<Input
					type="search"
					placeholder="Search feature flags..."
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="mb-4"
				/>

				{filteredFlags?.length === 0 ? (
					<p className="py-8 text-center text-muted-foreground">
						No feature flags found
					</p>
				) : (
					<div className="space-y-4">
						{filteredFlags?.map((flag) => (
							<div
								key={flag.id}
								className="flex items-center justify-between rounded-lg border p-4"
							>
								<div className="flex-1">
									<div className="flex items-center gap-2">
										<h3 className="font-medium">
											{flag.name}
										</h3>
										<Badge
											variant={
												flag.enabled
													? "default"
													: "secondary"
											}
										>
											{flag.enabled
												? "Enabled"
												: "Disabled"}
										</Badge>
										{flag.percentage < 100 && (
											<Badge variant="outline">
												{flag.percentage}%
											</Badge>
										)}
									</div>
									<p className="mt-1 font-mono text-muted-foreground text-sm">
										{flag.key}
									</p>
									{flag.description && (
										<p className="mt-1 text-muted-foreground text-sm">
											{flag.description}
										</p>
									)}
									{(flag.targetUsers.length > 0 ||
										flag.targetOrgs.length > 0) && (
										<div className="mt-2 flex gap-2">
											{flag.targetUsers.length > 0 && (
												<Badge variant="outline">
													{flag.targetUsers.length}{" "}
													users
												</Badge>
											)}
											{flag.targetOrgs.length > 0 && (
												<Badge variant="outline">
													{flag.targetOrgs.length}{" "}
													orgs
												</Badge>
											)}
										</div>
									)}
								</div>
								<div className="flex items-center gap-2">
									<Switch
										checked={flag.enabled}
										onCheckedChange={() =>
											handleToggle(flag)
										}
									/>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => setEditingFlag(flag)}
									>
										<PencilIcon className="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() =>
											confirm({
												title: "Delete Feature Flag",
												message:
													"Are you sure you want to delete this feature flag? This action cannot be undone.",
												confirmLabel: "Delete",
												destructive: true,
												onConfirm: () =>
													handleDelete(flag.key),
											})
										}
									>
										<TrashIcon className="size-4 text-destructive" />
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			{/* Edit Dialog */}
			<Dialog
				open={!!editingFlag}
				onOpenChange={(open) => !open && setEditingFlag(null)}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Edit Feature Flag</DialogTitle>
						<DialogDescription>
							Control feature availability and rollout
						</DialogDescription>
					</DialogHeader>

					{editingFlag && (
						<div className="space-y-4 py-4">
							<div className="space-y-2">
								<Label>Key</Label>
								<Input value={editingFlag.key} disabled />
							</div>

							<div className="space-y-2">
								<Label htmlFor="edit-name">Name</Label>
								<Input
									id="edit-name"
									value={editingFlag.name}
									onChange={(e) =>
										setEditingFlag({
											...editingFlag,
											name: e.target.value,
										})
									}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="edit-description">
									Description
								</Label>
								<Textarea
									id="edit-description"
									value={editingFlag.description || ""}
									onChange={(e) =>
										setEditingFlag({
											...editingFlag,
											description: e.target.value,
										})
									}
									rows={2}
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label>Enabled</Label>
									<p className="text-muted-foreground text-xs">
										Toggle feature availability
									</p>
								</div>
								<Switch
									checked={editingFlag.enabled}
									onCheckedChange={(checked) =>
										setEditingFlag({
											...editingFlag,
											enabled: checked,
										})
									}
								/>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label>Rollout Percentage</Label>
									<span className="text-muted-foreground text-sm">
										{editingFlag.percentage}%
									</span>
								</div>
								<Slider
									value={[editingFlag.percentage]}
									onValueChange={([value]) => {
										if (value !== undefined) {
											setEditingFlag({
												...editingFlag,
												percentage: value,
											});
										}
									}}
									min={0}
									max={100}
									step={1}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="edit-targetUsers">
									Target Users
								</Label>
								<Input
									id="edit-targetUsers"
									value={editingFlag.targetUsers.join(", ")}
									onChange={(e) =>
										setEditingFlag({
											...editingFlag,
											targetUsers: e.target.value
												? e.target.value
														.split(",")
														.map((s) => s.trim())
												: [],
										})
									}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="edit-targetOrgs">
									Target Organizations
								</Label>
								<Input
									id="edit-targetOrgs"
									value={editingFlag.targetOrgs.join(", ")}
									onChange={(e) =>
										setEditingFlag({
											...editingFlag,
											targetOrgs: e.target.value
												? e.target.value
														.split(",")
														.map((s) => s.trim())
												: [],
										})
									}
								/>
							</div>
						</div>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setEditingFlag(null)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleUpdate}
							disabled={updateMutation.isPending}
							loading={updateMutation.isPending}
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
