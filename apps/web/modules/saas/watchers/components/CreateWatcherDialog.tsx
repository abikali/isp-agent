"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateWatcher } from "../hooks/use-watchers";
import { INTERVAL_OPTIONS, WATCHER_TYPES } from "../lib/constants";
import {
	type NotificationConfig,
	NotificationSettings,
	toApiNotificationConfig,
} from "./NotificationSettings";

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive single-purpose TanStack Form create dialog; splitting would scatter shared form state
export function CreateWatcherDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const createWatcher = useCreateWatcher();
	const [notificationConfig, setNotificationConfig] =
		useState<NotificationConfig>({
			channels: [],
			events: { down: true, recovery: true, reminder: false },
		});
	const [showNotifications, setShowNotifications] = useState(false);

	const form = useForm({
		defaultValues: {
			name: "",
			type: "ping" as string,
			target: "",
			intervalSeconds: 300,
			port: "",
			expectedStatus: "200",
			recordType: "A",
			method: "GET",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}

			const config: Record<string, unknown> = {};
			if (value.type === "ping" || value.type === "port") {
				if (value.port) {
					config.port = Number.parseInt(value.port, 10);
				}
			}
			if (value.type === "http") {
				config.method = value.method;
				config.expectedStatus = Number.parseInt(
					value.expectedStatus,
					10,
				);
			}
			if (value.type === "dns") {
				config.recordType = value.recordType;
			}

			try {
				await createWatcher.mutateAsync({
					organizationId,
					name: value.name,
					type: value.type as "ping" | "http" | "port" | "dns",
					target: value.target,
					intervalSeconds: value.intervalSeconds,
					config: Object.keys(config).length > 0 ? config : undefined,
					notificationConfig:
						toApiNotificationConfig(notificationConfig),
				});
				toast.success("Watcher created");
				onOpenChange(false);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to create watcher",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const watcherType = useStore(form.store, (s) => s.values.type);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>Create Watcher</SheetTitle>
					<SheetDescription>
						Set up a new infrastructure monitor. It will start
						checking immediately after creation.
					</SheetDescription>
				</SheetHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- canonical TanStack Form submit; not a server-action form */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex flex-1 flex-col overflow-hidden"
				>
					<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
						<form.Field name="name">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="watcher-name">
										Name
									</FieldLabel>
									<Input
										id="watcher-name"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										placeholder="Production Server"
									/>
								</Field>
							)}
						</form.Field>

						<form.Field name="type">
							{(field) => (
								<Field>
									<FieldLabel>Type</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{WATCHER_TYPES.map((t) => (
												<SelectItem
													key={t.value}
													value={t.value}
												>
													{t.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>

						<form.Field name="target">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="watcher-target">
										Target
									</FieldLabel>
									<Input
										id="watcher-target"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										placeholder={
											watcherType === "http"
												? "https://example.com"
												: "example.com"
										}
									/>
									<FieldDescription>
										{watcherType === "http"
											? "Full URL including protocol"
											: "Hostname or IP address"}
									</FieldDescription>
								</Field>
							)}
						</form.Field>

						{(watcherType === "ping" || watcherType === "port") && (
							<form.Field name="port">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="watcher-port">
											Port
										</FieldLabel>
										<Input
											id="watcher-port"
											type="number"
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
											onBlur={field.handleBlur}
											placeholder="80"
										/>
									</Field>
								)}
							</form.Field>
						)}

						{watcherType === "http" && (
							<>
								<form.Field name="method">
									{(field) => (
										<Field>
											<FieldLabel>Method</FieldLabel>
											<Select
												value={field.state.value}
												onValueChange={
													field.handleChange
												}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="GET">
														GET
													</SelectItem>
													<SelectItem value="HEAD">
														HEAD
													</SelectItem>
													<SelectItem value="POST">
														POST
													</SelectItem>
												</SelectContent>
											</Select>
										</Field>
									)}
								</form.Field>
								<form.Field name="expectedStatus">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="watcher-status">
												Expected Status
											</FieldLabel>
											<Input
												id="watcher-status"
												type="number"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(
														e.target.value,
													)
												}
												onBlur={field.handleBlur}
												placeholder="200"
											/>
										</Field>
									)}
								</form.Field>
							</>
						)}

						{watcherType === "dns" && (
							<form.Field name="recordType">
								{(field) => (
									<Field>
										<FieldLabel>Record Type</FieldLabel>
										<Select
											value={field.state.value}
											onValueChange={field.handleChange}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{[
													"A",
													"AAAA",
													"MX",
													"NS",
													"CNAME",
													"TXT",
												].map((rt) => (
													<SelectItem
														key={rt}
														value={rt}
													>
														{rt}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</Field>
								)}
							</form.Field>
						)}

						<form.Field name="intervalSeconds">
							{(field) => (
								<Field>
									<FieldLabel>Check Interval</FieldLabel>
									<Select
										value={String(field.state.value)}
										onValueChange={(v) =>
											field.handleChange(
												Number.parseInt(v, 10),
											)
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{INTERVAL_OPTIONS.map((i) => (
												<SelectItem
													key={i.value}
													value={String(i.value)}
												>
													{i.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
						<div className="border-t pt-4">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="mb-2 w-full justify-start px-0"
								onClick={() =>
									setShowNotifications(!showNotifications)
								}
							>
								{showNotifications
									? "Hide Notification Settings"
									: "Configure Notifications"}
							</Button>
							{showNotifications && (
								<NotificationSettings
									value={notificationConfig}
									onChange={setNotificationConfig}
								/>
							)}
						</div>
					</div>

					<SheetFooter className="border-t border-border bg-surface-subtle/40 px-6 py-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Creating..." : "Create Watcher"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
