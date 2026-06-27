"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Badge } from "@ui/components/badge";
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
import { Separator } from "@ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Textarea } from "@ui/components/textarea";
import { toast } from "sonner";
import { useCreateAgent } from "../hooks/use-agents";
import { AI_MODEL_OPTIONS } from "../lib/constants";

export function CreateAgentDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const createAgent = useCreateAgent();

	const form = useForm({
		defaultValues: {
			name: "",
			description: "",
			systemPrompt: "",
			model: "gpt-4o-mini",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			try {
				await createAgent.mutateAsync({
					organizationId,
					name: value.name,
					description: value.description || undefined,
					systemPrompt: value.systemPrompt,
					model: value.model,
				});
				toast.success("Agent created");
				onOpenChange(false);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to create agent",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>Create AI Agent</SheetTitle>
					<SheetDescription>
						Set up a new AI agent to handle conversations
						automatically. You can configure advanced settings
						later.
					</SheetDescription>
				</SheetHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Form client-side submit; this app has no server action to wire up */}
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
									<FieldLabel htmlFor="agent-name">
										Name
									</FieldLabel>
									<Input
										id="agent-name"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										placeholder="Customer Support Bot"
									/>
								</Field>
							)}
						</form.Field>

						<form.Field name="description">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="agent-description">
										Description
									</FieldLabel>
									<Input
										id="agent-description"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										placeholder="Handles common customer inquiries"
									/>
									<FieldDescription>
										Optional. Helps you identify this agent
										in the list.
									</FieldDescription>
								</Field>
							)}
						</form.Field>

						<Separator />

						<form.Field name="systemPrompt">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="agent-prompt">
										System Prompt
									</FieldLabel>
									<Textarea
										id="agent-prompt"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										placeholder="You are a helpful customer support agent..."
										rows={4}
									/>
									<FieldDescription>
										Instructions that define how the agent
										behaves and responds.
									</FieldDescription>
								</Field>
							)}
						</form.Field>

						<form.Field name="model">
							{(field) => (
								<Field>
									<FieldLabel>Model</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{AI_MODEL_OPTIONS.map((m) => (
												<SelectItem
													key={m.id}
													value={m.id}
												>
													<div className="flex items-center gap-2">
														{m.label}
														<Badge
															variant="outline"
															className="text-[10px] px-1.5 py-0"
														>
															{m.provider}
														</Badge>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
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
							{isSubmitting ? "Creating..." : "Create Agent"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
