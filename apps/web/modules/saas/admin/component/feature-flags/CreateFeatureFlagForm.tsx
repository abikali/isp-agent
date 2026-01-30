"use client";

import { SettingsItem } from "@saas/shared/client";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Slider } from "@ui/components/slider";
import { Switch } from "@ui/components/switch";
import { Textarea } from "@ui/components/textarea";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CreateFeatureFlagForm() {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [key, setKey] = useState("");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [enabled, setEnabled] = useState(false);
	const [percentage, setPercentage] = useState(100);
	const [targetUsers, setTargetUsers] = useState("");
	const [targetOrgs, setTargetOrgs] = useState("");

	const createMutation = useMutation(
		orpc.featureFlags.create.mutationOptions(),
	);

	const handleCreate = async () => {
		try {
			await createMutation.mutateAsync({
				key: key.toLowerCase().replace(/\s+/g, "_"),
				name,
				description: description || undefined,
				enabled,
				percentage,
				targetUsers: targetUsers
					? targetUsers.split(",").map((s) => s.trim())
					: [],
				targetOrgs: targetOrgs
					? targetOrgs.split(",").map((s) => s.trim())
					: [],
			});

			queryClient.invalidateQueries({
				queryKey: orpc.featureFlags.list.key(),
			});

			toast.success("Feature flag created successfully");
			setOpen(false);
			resetForm();
		} catch {
			toast.error("Failed to create feature flag");
		}
	};

	const resetForm = () => {
		setKey("");
		setName("");
		setDescription("");
		setEnabled(false);
		setPercentage(100);
		setTargetUsers("");
		setTargetOrgs("");
	};

	return (
		<SettingsItem
			title="Feature Flags"
			description="Control feature availability and rollout"
		>
			<div className="flex justify-end">
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button>
							<PlusIcon className="mr-2 size-4" />
							Create Feature Flag
						</Button>
					</DialogTrigger>
					<DialogContent className="max-w-lg">
						<DialogHeader>
							<DialogTitle>Create Feature Flag</DialogTitle>
							<DialogDescription>
								Control feature availability and rollout
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4 py-4">
							<div className="space-y-2">
								<Label htmlFor="key">Key</Label>
								<Input
									id="key"
									placeholder="my_feature_flag"
									value={key}
									onChange={(e) => setKey(e.target.value)}
								/>
								<p className="text-muted-foreground text-xs">
									Unique identifier (lowercase, underscores
									only)
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									placeholder="My Feature Flag"
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="description">Description</Label>
								<Textarea
									id="description"
									placeholder="Describe what this flag controls..."
									value={description}
									onChange={(e) =>
										setDescription(e.target.value)
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
									checked={enabled}
									onCheckedChange={setEnabled}
								/>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label>Rollout Percentage</Label>
									<span className="text-muted-foreground text-sm">
										{percentage}%
									</span>
								</div>
								<Slider
									value={[percentage]}
									onValueChange={([value]) => {
										if (value !== undefined) {
											setPercentage(value);
										}
									}}
									min={0}
									max={100}
									step={1}
								/>
								<p className="text-muted-foreground text-xs">
									Percentage of users who will see this
									feature
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="targetUsers">
									Target Users
								</Label>
								<Input
									id="targetUsers"
									placeholder="user_id_1, user_id_2"
									value={targetUsers}
									onChange={(e) =>
										setTargetUsers(e.target.value)
									}
								/>
								<p className="text-muted-foreground text-xs">
									Comma-separated user IDs to target
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="targetOrgs">
									Target Organizations
								</Label>
								<Input
									id="targetOrgs"
									placeholder="org_id_1, org_id_2"
									value={targetOrgs}
									onChange={(e) =>
										setTargetOrgs(e.target.value)
									}
								/>
								<p className="text-muted-foreground text-xs">
									Comma-separated organization IDs to target
								</p>
							</div>
						</div>

						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button
								onClick={handleCreate}
								disabled={
									!key || !name || createMutation.isPending
								}
								loading={createMutation.isPending}
							>
								Create
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</SettingsItem>
	);
}
