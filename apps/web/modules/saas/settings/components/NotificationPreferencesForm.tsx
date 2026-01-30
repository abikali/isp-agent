"use client";

import { SettingsItem } from "@saas/shared/client";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Label } from "@ui/components/label";
import { Switch } from "@ui/components/switch";
import {
	BarChart3Icon,
	BellIcon,
	LoaderIcon,
	ShieldIcon,
	UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface PreferenceCategory {
	id: string;
	label: string;
	description: string;
	icon: React.ReactNode;
	inAppKey: string;
	emailKey: string;
}

const categories: PreferenceCategory[] = [
	{
		id: "leads",
		label: "Lead Notifications",
		description:
			"Get notified when someone submits their contact info via your profile",
		icon: <BellIcon className="size-5" />,
		inAppKey: "leadsInApp",
		emailKey: "leadsEmail",
	},
	{
		id: "team",
		label: "Team Updates",
		description:
			"Notifications about team members joining or leaving your organization",
		icon: <UsersIcon className="size-5" />,
		inAppKey: "teamInApp",
		emailKey: "teamEmail",
	},
	{
		id: "analytics",
		label: "Analytics Milestones",
		description: "Celebrate when your profiles reach view milestones",
		icon: <BarChart3Icon className="size-5" />,
		inAppKey: "analyticsInApp",
		emailKey: "analyticsEmail",
	},
	{
		id: "security",
		label: "Security Alerts",
		description: "Important security notifications like new device logins",
		icon: <ShieldIcon className="size-5" />,
		inAppKey: "securityInApp",
		emailKey: "securityEmail",
	},
];

type PreferenceKey =
	| "leadsInApp"
	| "leadsEmail"
	| "teamInApp"
	| "teamEmail"
	| "analyticsInApp"
	| "analyticsEmail"
	| "securityInApp"
	| "securityEmail";

type Preferences = Record<PreferenceKey, boolean>;

const defaultPreferences: Preferences = {
	leadsInApp: true,
	leadsEmail: true,
	teamInApp: true,
	teamEmail: true,
	analyticsInApp: true,
	analyticsEmail: false,
	securityInApp: true,
	securityEmail: true,
};

export function NotificationPreferencesForm() {
	const queryClient = useQueryClient();
	const [localPreferences, setLocalPreferences] =
		useState<Preferences>(defaultPreferences);
	const [hasChanges, setHasChanges] = useState(false);

	const { data: preferences, isLoading } = useQuery(
		orpc.notifications.getPreferences.queryOptions({}),
	);

	const updateMutation = useMutation({
		...orpc.notifications.updatePreferences.mutationOptions(),
		onSuccess: () => {
			toast.success("Notification preferences saved");
			setHasChanges(false);
			queryClient.invalidateQueries({
				queryKey: ["notifications", "getPreferences"],
			});
		},
		onError: () => {
			toast.error("Failed to save notification preferences");
		},
	});

	// Initialize local state when data loads
	useEffect(() => {
		if (preferences) {
			setLocalPreferences(preferences as Preferences);
		}
	}, [preferences]);

	const handleToggle = useCallback((key: PreferenceKey, value: boolean) => {
		setLocalPreferences((prev) => ({
			...prev,
			[key]: value,
		}));
		setHasChanges(true);
	}, []);

	const handleSave = useCallback(() => {
		updateMutation.mutate(localPreferences);
	}, [updateMutation, localPreferences]);

	if (isLoading) {
		return (
			<SettingsItem
				title="Notification Preferences"
				description="Configure how you want to receive notifications"
			>
				<div className="flex items-center justify-center py-8">
					<LoaderIcon className="size-6 animate-spin text-muted-foreground" />
				</div>
			</SettingsItem>
		);
	}

	return (
		<SettingsItem
			title="Notification Preferences"
			description="Configure how you want to receive notifications"
			fullWidth
		>
			<div className="space-y-6">
				{categories.map((category) => (
					<div
						key={category.id}
						className="rounded-lg border border-border p-4"
					>
						<div className="flex items-start gap-3">
							<div className="rounded-md bg-muted p-2 text-muted-foreground">
								{category.icon}
							</div>
							<div className="flex-1">
								<h4 className="font-medium">
									{category.label}
								</h4>
								<p className="text-sm text-muted-foreground">
									{category.description}
								</p>
								<div className="mt-4 flex flex-wrap gap-6">
									<div className="flex items-center gap-2">
										<Switch
											id={`${category.id}-inapp`}
											checked={
												localPreferences[
													category.inAppKey as PreferenceKey
												]
											}
											onCheckedChange={(checked) =>
												handleToggle(
													category.inAppKey as PreferenceKey,
													checked,
												)
											}
										/>
										<Label
											htmlFor={`${category.id}-inapp`}
											className="text-sm font-normal"
										>
											In-app notifications
										</Label>
									</div>
									<div className="flex items-center gap-2">
										<Switch
											id={`${category.id}-email`}
											checked={
												localPreferences[
													category.emailKey as PreferenceKey
												]
											}
											onCheckedChange={(checked) =>
												handleToggle(
													category.emailKey as PreferenceKey,
													checked,
												)
											}
										/>
										<Label
											htmlFor={`${category.id}-email`}
											className="text-sm font-normal"
										>
											Email notifications
										</Label>
									</div>
								</div>
							</div>
						</div>
					</div>
				))}

				<div className="flex justify-end pt-2">
					<Button
						onClick={handleSave}
						disabled={!hasChanges || updateMutation.isPending}
					>
						{updateMutation.isPending ? (
							<>
								<LoaderIcon className="mr-2 size-4 animate-spin" />
								Saving...
							</>
						) : (
							"Save Preferences"
						)}
					</Button>
				</div>
			</div>
		</SettingsItem>
	);
}
