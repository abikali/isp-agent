"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Badge } from "@ui/components/badge";
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
import { Separator } from "@ui/components/separator";
import { Textarea } from "@ui/components/textarea";
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
			await createAgent.mutateAsync({
				organizationId,
				name: value.name,
				description: value.description || undefined,
				systemPrompt: value.systemPrompt,
				model: value.model,
			});
			onOpenChange(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Create AI Agent</DialogTitle>
					<DialogDescription>
						Set up a new AI agent to handle conversations
						automatically. You can configure advanced settings
						later.
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

					<DialogFooter>
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
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
