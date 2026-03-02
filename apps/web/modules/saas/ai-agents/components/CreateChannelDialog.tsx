"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
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
					value.provider === "whatsapp" ? value.sessionId : undefined,
			});
			onOpenChange(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const selectedProvider = useStore(form.store, (s) => s.values.provider);
	const tokenConfig = PROVIDER_TOKEN_CONFIG[selectedProvider];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add Channel</DialogTitle>
					<DialogDescription>
						Connect a WhatsApp or Telegram channel to this agent.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<div className="space-y-4 py-4">
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

					<DialogFooter>
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
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
