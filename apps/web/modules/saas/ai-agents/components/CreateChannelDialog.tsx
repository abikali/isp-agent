"use client";

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
import { toast } from "sonner";
import { useCreateChannel } from "../hooks/use-channels";
import { PROVIDER_OPTIONS } from "../lib/constants";

const PROVIDER_TOKEN_CONFIG = {
	telegram: {
		label: "Bot Token",
		helpText:
			"Create a bot with @BotFather on Telegram and paste the token here",
		placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
	},
	whatsapp: {
		label: "WaSender Session API Key",
		helpText: "Get your Session API Key from your WaSender dashboard",
		placeholder: "Your WaSender Session API Key",
	},
} as const;

export function CreateChannelDialog({
	agentId,
	organizationId,
	open,
	onOpenChange,
}: {
	agentId: string;
	organizationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const createChannel = useCreateChannel();

	const form = useForm({
		defaultValues: {
			provider: "whatsapp" as "whatsapp" | "telegram",
			name: "",
			apiToken: "",
			personalAccessToken: "",
			sessionId: "",
		},
		onSubmit: async ({ value }) => {
			try {
				await createChannel.mutateAsync({
					agentId,
					organizationId,
					provider: value.provider,
					name: value.name,
					apiToken: value.apiToken,
					personalAccessToken:
						value.provider === "whatsapp"
							? value.personalAccessToken
							: undefined,
					sessionId:
						value.provider === "whatsapp"
							? value.sessionId
							: undefined,
				});
				toast.success("Channel created");
				onOpenChange(false);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to create channel",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const selectedProvider = useStore(form.store, (s) => s.values.provider);
	const tokenConfig = PROVIDER_TOKEN_CONFIG[selectedProvider];

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>Add Channel</SheetTitle>
					<SheetDescription>
						Connect a WhatsApp or Telegram channel to this agent.
					</SheetDescription>
				</SheetHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex flex-1 flex-col overflow-hidden"
				>
					<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
						<form.Field name="provider">
							{(field) => (
								<Field>
									<FieldLabel>Provider</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(v) => {
											field.handleChange(
												v as "whatsapp" | "telegram",
											);
											form.setFieldValue("apiToken", "");
										}}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PROVIDER_OPTIONS.map((p) => (
												<SelectItem
													key={p.id}
													value={p.id}
												>
													{p.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>

						<form.Field name="name">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="channel-name">
										Channel Name
									</FieldLabel>
									<Input
										id="channel-name"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										placeholder="Main WhatsApp Line"
									/>
								</Field>
							)}
						</form.Field>

						<form.Field name="apiToken">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="channel-token">
										{tokenConfig.label}
									</FieldLabel>
									<Input
										id="channel-token"
										type="password"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										placeholder={tokenConfig.placeholder}
									/>
									<FieldDescription>
										{tokenConfig.helpText}
									</FieldDescription>
								</Field>
							)}
						</form.Field>

						{selectedProvider === "whatsapp" && (
							<>
								<form.Field name="personalAccessToken">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="channel-pat">
												WaSender Personal Access Token
											</FieldLabel>
											<Input
												id="channel-pat"
												type="password"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(
														e.target.value,
													)
												}
												onBlur={field.handleBlur}
												placeholder="Your Personal Access Token"
											/>
											<FieldDescription>
												Generate from WaSender Settings
												page
											</FieldDescription>
										</Field>
									)}
								</form.Field>

								<form.Field name="sessionId">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="channel-session-id">
												WaSender Session ID
											</FieldLabel>
											<Input
												id="channel-session-id"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(
														e.target.value,
													)
												}
												onBlur={field.handleBlur}
												placeholder="Your WaSender Session ID"
											/>
											<FieldDescription>
												Found in your WaSender session
												details
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							</>
						)}
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
							{isSubmitting ? "Adding..." : "Add Channel"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
