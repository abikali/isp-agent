"use client";

import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/components/accordion";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { Checkbox } from "@ui/components/checkbox";
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Separator } from "@ui/components/separator";
import { Slider } from "@ui/components/slider";
import { Switch } from "@ui/components/switch";
import { Textarea } from "@ui/components/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import {
	AlertTriangleIcon,
	BotIcon,
	BrainIcon,
	HelpCircleIcon,
	Loader2Icon,
	SlidersHorizontalIcon,
	SparklesIcon,
	WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { useGenerateSystemPrompt, useUpdateAgent } from "../hooks/use-agents";
import { useAvailableTools } from "../hooks/use-tools";
import { AI_MODEL_OPTIONS } from "../lib/constants";
import { ToolConfigDialog } from "./ToolConfigDialog";

function FieldHint({ text }: { text: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<HelpCircleIcon className="ml-1 inline size-3.5 text-muted-foreground/60 cursor-help" />
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-xs">
				{text}
			</TooltipContent>
		</Tooltip>
	);
}

export function AgentSettings({
	agentId,
	organizationId,
}: {
	agentId: string;
	organizationId: string;
}) {
	const { data } = useSuspenseQuery(
		orpc.aiAgents.getAgent.queryOptions({
			input: { agentId, organizationId },
		}),
	);

	const agent = data.agent;
	const updateAgent = useUpdateAgent();
	const { tools: availableTools } = useAvailableTools();

	const [configDialog, setConfigDialog] = useState<{
		toolId: string;
		toolName: string;
		configFields: Array<{
			key: string;
			label: string;
			type: "text" | "password" | "select";
			required: boolean;
			placeholder?: string | undefined;
			options?: Array<{ label: string; value: string }> | undefined;
		}>;
	} | null>(null);

	const toolConfigMap: Record<string, Record<string, unknown>> = {};
	for (const tc of agent.toolConfigs) {
		toolConfigMap[tc.toolId] = tc.config as Record<string, unknown>;
	}

	const form = useForm({
		defaultValues: {
			name: agent.name,
			description: agent.description ?? "",
			systemPrompt: agent.systemPrompt,
			greetingMessage: agent.greetingMessage ?? "",
			model: agent.model,
			knowledgeBase: agent.knowledgeBase ?? "",
			enabled: agent.enabled,
			maintenanceMode: agent.maintenanceMode,
			maintenanceMessage: agent.maintenanceMessage ?? "",
			maxHistoryLength: agent.maxHistoryLength,
			temperature: agent.temperature,
			enabledTools: agent.enabledTools as string[],
		},
		onSubmit: async ({ value }) => {
			await updateAgent.mutateAsync({
				agentId,
				organizationId,
				name: value.name,
				description: value.description || undefined,
				systemPrompt: value.systemPrompt,
				greetingMessage: value.greetingMessage || undefined,
				model: value.model,
				knowledgeBase: value.knowledgeBase || undefined,
				enabled: value.enabled,
				maintenanceMode: value.maintenanceMode,
				maintenanceMessage: value.maintenanceMessage || undefined,
				maxHistoryLength: value.maxHistoryLength,
				temperature: value.temperature,
				enabledTools: value.enabledTools,
			});
		},
	});

	const generatePrompt = useGenerateSystemPrompt();
	const isGenerating = generatePrompt.isPending;

	async function handleGeneratePrompt() {
		const enabledTools = form.getFieldValue("enabledTools");
		const currentPrompt = form.getFieldValue("systemPrompt");
		const name = form.getFieldValue("name");
		const description = form.getFieldValue("description");

		const result = await generatePrompt.mutateAsync({
			organizationId,
			enabledToolIds: enabledTools,
			currentPrompt: currentPrompt || undefined,
			agentName: name || undefined,
			agentDescription: description || undefined,
		});

		form.setFieldValue("systemPrompt", result.systemPrompt);
	}

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<TooltipProvider>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				{/* Header with status toggle */}
				<Card className="mb-6">
					<CardHeader>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
									<BotIcon className="size-5 text-primary" />
								</div>
								<div>
									<CardTitle className="text-lg">
										{agent.name}
									</CardTitle>
									<CardDescription>
										Configure how your agent behaves and
										responds
									</CardDescription>
								</div>
							</div>
							<form.Field name="enabled">
								{(field) => (
									<div className="flex items-center gap-2">
										<Badge
											variant={
												field.state.value
													? "default"
													: "secondary"
											}
										>
											{field.state.value
												? "Active"
												: "Disabled"}
										</Badge>
										<Switch
											checked={field.state.value}
											onCheckedChange={field.handleChange}
										/>
									</div>
								)}
							</form.Field>
						</div>
					</CardHeader>
				</Card>

				{/* Maintenance Mode */}
				<form.Field name="maintenanceMode">
					{(modeField) => (
						<Card
							className={`mb-6 ${modeField.state.value ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
						>
							<CardHeader>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div
											className={`flex size-10 items-center justify-center rounded-lg ${modeField.state.value ? "bg-amber-100 dark:bg-amber-900/50" : "bg-muted"}`}
										>
											<AlertTriangleIcon
												className={`size-5 ${modeField.state.value ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
											/>
										</div>
										<div>
											<CardTitle className="text-lg">
												Maintenance Mode
											</CardTitle>
											<CardDescription>
												Inform customers about known
												issues or outages
											</CardDescription>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Badge
											variant={
												modeField.state.value
													? "destructive"
													: "secondary"
											}
										>
											{modeField.state.value
												? "Active"
												: "Off"}
										</Badge>
										<Switch
											checked={modeField.state.value}
											onCheckedChange={
												modeField.handleChange
											}
										/>
									</div>
								</div>
								{modeField.state.value && (
									<form.Field name="maintenanceMessage">
										{(msgField) => (
											<div className="mt-4">
												<FieldLabel htmlFor="maintenance-message">
													What should the agent know?
													<FieldHint text="Describe the issue internally. The agent will rephrase this naturally — it won't be shown verbatim to customers." />
												</FieldLabel>
												<Textarea
													id="maintenance-message"
													value={msgField.state.value}
													onChange={(e) =>
														msgField.handleChange(
															e.target.value,
														)
													}
													onBlur={msgField.handleBlur}
													rows={3}
													placeholder="e.g. Fiber cut in downtown area affecting ~200 customers. Repair crew dispatched, ETA 4 hours."
													className="mt-1.5"
												/>
											</div>
										)}
									</form.Field>
								)}
							</CardHeader>
						</Card>
					)}
				</form.Field>

				{/* Accordion sections */}
				<Accordion
					type="multiple"
					defaultValue={["general", "behavior"]}
					className="space-y-4"
				>
					{/* General Section */}
					<Card>
						<AccordionItem value="general" className="border-b-0">
							<AccordionTrigger className="px-6 py-4 hover:no-underline">
								<div className="flex items-center gap-2.5">
									<BotIcon className="size-4 text-muted-foreground" />
									<span className="font-semibold">
										General
									</span>
								</div>
							</AccordionTrigger>
							<AccordionContent className="px-6 pb-6">
								<div className="space-y-4">
									<form.Field name="name">
										{(field) => (
											<Field>
												<FieldLabel htmlFor="settings-name">
													Name
												</FieldLabel>
												<Input
													id="settings-name"
													value={field.state.value}
													onChange={(e) =>
														field.handleChange(
															e.target.value,
														)
													}
													onBlur={field.handleBlur}
													placeholder="My AI Agent"
												/>
											</Field>
										)}
									</form.Field>

									<form.Field name="description">
										{(field) => (
											<Field>
												<FieldLabel htmlFor="settings-description">
													Description
													<FieldHint text="A short description visible in your agents list. Helps you identify this agent's purpose." />
												</FieldLabel>
												<Input
													id="settings-description"
													value={field.state.value}
													onChange={(e) =>
														field.handleChange(
															e.target.value,
														)
													}
													onBlur={field.handleBlur}
													placeholder="Handles customer inquiries about orders"
												/>
											</Field>
										)}
									</form.Field>
								</div>
							</AccordionContent>
						</AccordionItem>
					</Card>

					{/* Behavior Section */}
					<Card>
						<AccordionItem value="behavior" className="border-b-0">
							<AccordionTrigger className="px-6 py-4 hover:no-underline">
								<div className="flex items-center gap-2.5">
									<BrainIcon className="size-4 text-muted-foreground" />
									<span className="font-semibold">
										Behavior
									</span>
								</div>
							</AccordionTrigger>
							<AccordionContent className="px-6 pb-6">
								<div className="space-y-4">
									<form.Field name="systemPrompt">
										{(field) => (
											<Field>
												<div className="flex items-center justify-between">
													<FieldLabel htmlFor="settings-prompt">
														System Prompt
														<FieldHint text="Instructions that define how the agent behaves. This is the core personality and rules for your agent." />
													</FieldLabel>
													<Button
														type="button"
														variant="outline"
														size="sm"
														disabled={isGenerating}
														onClick={
															handleGeneratePrompt
														}
													>
														{isGenerating ? (
															<Loader2Icon className="size-3.5 animate-spin" />
														) : (
															<SparklesIcon className="size-3.5" />
														)}
														{isGenerating
															? "Generating..."
															: "Generate with AI"}
													</Button>
												</div>
												<Textarea
													id="settings-prompt"
													value={field.state.value}
													onChange={(e) =>
														field.handleChange(
															e.target.value,
														)
													}
													onBlur={field.handleBlur}
													rows={6}
													placeholder="You are a helpful customer support agent..."
												/>
											</Field>
										)}
									</form.Field>

									<Separator />

									<form.Field name="greetingMessage">
										{(field) => (
											<Field>
												<FieldLabel htmlFor="settings-greeting">
													Greeting Message
													<FieldHint text="The first message sent when a user starts a new conversation. Used for Telegram /start and web chat." />
												</FieldLabel>
												<Textarea
													id="settings-greeting"
													value={field.state.value}
													onChange={(e) =>
														field.handleChange(
															e.target.value,
														)
													}
													onBlur={field.handleBlur}
													rows={2}
													placeholder="Hello! How can I help you today?"
												/>
											</Field>
										)}
									</form.Field>

									<Separator />

									<form.Field name="knowledgeBase">
										{(field) => (
											<Field>
												<FieldLabel htmlFor="settings-kb">
													Knowledge Base
													<FieldHint text="Extra context provided to the agent alongside the system prompt. Add FAQs, product info, or company policies here." />
												</FieldLabel>
												<Textarea
													id="settings-kb"
													value={field.state.value}
													onChange={(e) =>
														field.handleChange(
															e.target.value,
														)
													}
													onBlur={field.handleBlur}
													rows={4}
													placeholder="Additional context and information for the agent..."
												/>
											</Field>
										)}
									</form.Field>
								</div>
							</AccordionContent>
						</AccordionItem>
					</Card>

					{/* Model Configuration Section */}
					<Card>
						<AccordionItem value="model" className="border-b-0">
							<AccordionTrigger className="px-6 py-4 hover:no-underline">
								<div className="flex items-center gap-2.5">
									<SlidersHorizontalIcon className="size-4 text-muted-foreground" />
									<span className="font-semibold">
										Model Configuration
									</span>
								</div>
							</AccordionTrigger>
							<AccordionContent className="px-6 pb-6">
								<div className="space-y-6">
									<form.Field name="model">
										{(field) => (
											<Field>
												<FieldLabel>
													Model
													<FieldHint text="The AI model powering this agent. Larger models are more capable but slower and cost more." />
												</FieldLabel>
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
														{AI_MODEL_OPTIONS.map(
															(m) => (
																<SelectItem
																	key={m.id}
																	value={m.id}
																>
																	<div className="flex items-center gap-2">
																		{
																			m.label
																		}
																		<Badge
																			variant="outline"
																			className="text-[10px] px-1.5 py-0"
																		>
																			{
																				m.provider
																			}
																		</Badge>
																	</div>
																</SelectItem>
															),
														)}
													</SelectContent>
												</Select>
											</Field>
										)}
									</form.Field>

									<div className="grid gap-6 sm:grid-cols-2">
										<form.Field name="temperature">
											{(field) => (
												<Field>
													<FieldLabel>
														Temperature:{" "}
														<span className="font-mono text-primary">
															{field.state.value.toFixed(
																1,
															)}
														</span>
														<FieldHint text="Controls randomness. Lower values (0.0-0.5) produce focused, deterministic responses. Higher values (1.0-2.0) produce more creative, varied outputs." />
													</FieldLabel>
													<Slider
														value={[
															field.state.value,
														]}
														onValueChange={([
															v,
														]) => {
															if (
																v !== undefined
															) {
																field.handleChange(
																	v,
																);
															}
														}}
														min={0}
														max={2}
														step={0.1}
													/>
													<div className="flex justify-between text-[10px] text-muted-foreground">
														<span>Precise</span>
														<span>Creative</span>
													</div>
												</Field>
											)}
										</form.Field>

										<form.Field name="maxHistoryLength">
											{(field) => (
												<Field>
													<FieldLabel htmlFor="settings-history">
														Max History:{" "}
														<span className="font-mono text-primary">
															{field.state.value}
														</span>{" "}
														messages
														<FieldHint text="Number of previous messages included as context. More history = better context but higher token usage." />
													</FieldLabel>
													<Slider
														id="settings-history"
														value={[
															field.state.value,
														]}
														onValueChange={([
															v,
														]) => {
															if (
																v !== undefined
															) {
																field.handleChange(
																	v,
																);
															}
														}}
														min={1}
														max={50}
														step={1}
													/>
													<div className="flex justify-between text-[10px] text-muted-foreground">
														<span>Minimal</span>
														<span>
															Full context
														</span>
													</div>
												</Field>
											)}
										</form.Field>
									</div>
								</div>
							</AccordionContent>
						</AccordionItem>
					</Card>

					{/* Tools Section */}
					{availableTools.length > 0 && (
						<Card>
							<AccordionItem value="tools" className="border-b-0">
								<AccordionTrigger className="px-6 py-4 hover:no-underline">
									<div className="flex items-center gap-2.5">
										<WrenchIcon className="size-4 text-muted-foreground" />
										<span className="font-semibold">
											Tools
										</span>
										<Badge
											variant="secondary"
											className="ml-1"
										>
											{availableTools.length} available
										</Badge>
									</div>
								</AccordionTrigger>
								<AccordionContent className="px-6 pb-6">
									<p className="mb-4 text-sm text-muted-foreground">
										Enable tools that the agent can use
										during conversations.
									</p>
									<form.Field name="enabledTools">
										{(field) => (
											<div className="space-y-2">
												{availableTools.map((tool) => {
													const isEnabled =
														field.state.value.includes(
															tool.id,
														);
													return (
														<div
															key={tool.id}
															className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
														>
															<Checkbox
																id={`tool-${tool.id}`}
																checked={
																	isEnabled
																}
																onCheckedChange={(
																	checked,
																) => {
																	if (
																		checked
																	) {
																		field.handleChange(
																			[
																				...field
																					.state
																					.value,
																				tool.id,
																			],
																		);
																	} else {
																		field.handleChange(
																			field.state.value.filter(
																				(
																					t: string,
																				) =>
																					t !==
																					tool.id,
																			),
																		);
																	}
																}}
																className="mt-0.5"
															/>
															<div className="flex-1 min-w-0">
																<div className="flex items-center gap-2">
																	<label
																		htmlFor={`tool-${tool.id}`}
																		className="text-sm font-medium cursor-pointer"
																	>
																		{
																			tool.name
																		}
																	</label>
																	<Badge variant="secondary">
																		{
																			tool.category
																		}
																	</Badge>
																</div>
																<p className="text-xs text-muted-foreground mt-0.5">
																	{
																		tool.description
																	}
																</p>
															</div>
															{tool.requiresConfig && (
																<Button
																	type="button"
																	variant="outline"
																	size="sm"
																	onClick={() =>
																		setConfigDialog(
																			{
																				toolId: tool.id,
																				toolName:
																					tool.name,
																				configFields:
																					tool.configFields ??
																					[],
																			},
																		)
																	}
																>
																	Configure
																</Button>
															)}
														</div>
													);
												})}
											</div>
										)}
									</form.Field>
								</AccordionContent>
							</AccordionItem>
						</Card>
					)}
				</Accordion>

				{/* Save button */}
				<div className="sticky bottom-4 z-10 mt-6 flex justify-end">
					<Button
						type="submit"
						disabled={isSubmitting}
						size="lg"
						className="shadow-lg"
					>
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>

			{configDialog && (
				<ToolConfigDialog
					open={true}
					onOpenChange={(open) => {
						if (!open) {
							setConfigDialog(null);
						}
					}}
					agentId={agentId}
					organizationId={organizationId}
					toolId={configDialog.toolId}
					toolName={configDialog.toolName}
					configFields={configDialog.configFields}
					existingConfig={toolConfigMap[configDialog.toolId]}
				/>
			)}
		</TooltipProvider>
	);
}
