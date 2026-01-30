"use client";

import { urlSchema } from "@repo/api/lib/validation";
import { SettingsItem } from "@saas/shared/client";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useActiveOrganization } from "../hooks/use-active-organization";

const WEBHOOK_EVENTS = [
	"user.created",
	"user.updated",
	"user.deleted",
	"organization.created",
	"organization.updated",
	"organization.deleted",
	"member.invited",
	"member.joined",
	"member.removed",
	"member.role_changed",
	"subscription.created",
	"subscription.updated",
	"subscription.canceled",
	"payment.completed",
	"payment.failed",
] as const;

export function CreateWebhookForm() {
	const queryClient = useQueryClient();
	const { activeOrganization } = useActiveOrganization();
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const createMutation = useMutation(orpc.webhooks.create.mutationOptions());

	const form = useForm({
		defaultValues: {
			url: "",
			events: [] as string[],
		},
		onSubmit: async ({ value }) => {
			if (!activeOrganization) {
				return;
			}

			try {
				const result = await createMutation.mutateAsync({
					organizationId: activeOrganization.id,
					url: value.url,
					events: value.events,
				});

				setNewSecret(result.secret);
				form.reset();
				queryClient.invalidateQueries({
					queryKey: orpc.webhooks.list.key(),
				});
				toast.success("Webhook created successfully");
			} catch {
				toast.error("Failed to create webhook");
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const isValid = useStore(form.store, (state) => state.isValid);
	const selectedEvents = useStore(form.store, (state) => state.values.events);

	const toggleEvent = (event: string) => {
		const current = form.getFieldValue("events");
		if (current.includes(event)) {
			form.setFieldValue(
				"events",
				current.filter((e) => e !== event),
			);
		} else {
			form.setFieldValue("events", [...current, event]);
		}
	};

	const copySecret = async () => {
		if (newSecret) {
			await navigator.clipboard.writeText(newSecret);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	if (!activeOrganization) {
		return null;
	}

	return (
		<SettingsItem
			title="Create Webhook"
			description="Configure webhooks to receive real-time notifications about events in your organization."
		>
			{newSecret ? (
				<div className="space-y-4">
					<div className="rounded-md border border-border bg-muted/50 p-4">
						<p className="mb-2 text-sm font-medium">
							Webhook Secret
						</p>
						<p className="mb-2 text-sm text-muted-foreground">
							Save this secret key securely. You won't be able to
							see it again.
						</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 break-all rounded bg-background p-2 font-mono text-sm">
								{newSecret}
							</code>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={copySecret}
							>
								{copied ? (
									<CheckIcon className="size-4" />
								) : (
									<CopyIcon className="size-4" />
								)}
							</Button>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={() => setNewSecret(null)}
					>
						Create another webhook
					</Button>
				</div>
			) : (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field
						name="url"
						validators={{
							onBlur: urlSchema,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="url">
										Webhook URL
									</FieldLabel>
									<Input
										id="url"
										type="url"
										placeholder="https://example.com/webhook"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										aria-invalid={hasErrors || undefined}
									/>
									{hasErrors && (
										<FieldError
											errors={field.state.meta.errors}
										/>
									)}
								</Field>
							);
						}}
					</form.Field>

					<form.Field
						name="events"
						validators={{
							onChange: ({ value }) =>
								value.length === 0
									? "Select at least one event"
									: undefined,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<Label>Events</Label>
									<p className="text-sm text-muted-foreground">
										Select which events should trigger this
										webhook.
									</p>
									<div className="grid gap-2 pt-2 sm:grid-cols-2">
										{WEBHOOK_EVENTS.map((event) => (
											<label
												key={event}
												htmlFor={`webhook-event-${event}`}
												className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-muted/50"
											>
												<Checkbox
													id={`webhook-event-${event}`}
													checked={selectedEvents.includes(
														event,
													)}
													onCheckedChange={() =>
														toggleEvent(event)
													}
												/>
												<span className="text-sm">
													{event}
												</span>
											</label>
										))}
									</div>
									{hasErrors && (
										<FieldError
											errors={field.state.meta.errors}
										/>
									)}
								</Field>
							);
						}}
					</form.Field>

					<div className="flex justify-end">
						<Button
							type="submit"
							disabled={!isValid}
							loading={isSubmitting}
						>
							Create Webhook
						</Button>
					</div>
				</form>
			)}
		</SettingsItem>
	);
}
