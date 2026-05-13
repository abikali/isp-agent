"use client";

import { usePlansQuery } from "@saas/customers/client";
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
import { Card } from "@ui/components/card";
import { Checkbox } from "@ui/components/checkbox";
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
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
import { cn } from "@ui/lib";
import {
	AlertTriangleIcon,
	BotIcon,
	BrainIcon,
	FileTextIcon,
	HandIcon,
	HelpCircleIcon,
	Loader2Icon,
	RotateCcwIcon,
	SearchIcon,
	SlidersHorizontalIcon,
	SparklesIcon,
	WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useGenerateSystemPrompt, useUpdateAgent } from "../hooks/use-agents";
import { useAvailableTools } from "../hooks/use-tools";
import {
	AI_MODEL_GROUPS,
	AI_MODEL_OPTIONS,
	DEFAULT_PROMPT_SECTIONS,
	type PromptSection,
} from "../lib/constants";
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

type ToggleCardTone = "default" | "warning" | "info";

interface ToggleCardProps {
	icon: typeof BotIcon;
	title: string;
	description: string;
	active: boolean;
	activeTone?: ToggleCardTone;
	badgeLabel: string;
	badgeVariant: "default" | "secondary" | "warning" | "destructive";
	checked: boolean;
	onCheckedChange: (next: boolean) => void;
	children?: React.ReactNode;
}

/**
 * Compact feature toggle. A single-line bar (icon · title · status hint ·
 * badge · switch) that expands a contextual input below when the toggle is on.
 * Replaces the old CardHeader-style toggles that had a heavy left side
 * (icon tile + h3 title + description) sitting next to a tiny right-side
 * switch — the asymmetry made the cards look unfinished.
 */
function ToggleCard({
	icon: Icon,
	title,
	description,
	active,
	activeTone = "default",
	badgeLabel,
	badgeVariant,
	checked,
	onCheckedChange,
	children,
}: ToggleCardProps) {
	const toneRing =
		active && activeTone === "warning"
			? "border-warning/40 bg-warning/5"
			: active && activeTone === "info"
				? "border-info/40 bg-info/5"
				: "border-border";
	const iconTone =
		active && activeTone === "warning"
			? "text-warning"
			: active && activeTone === "info"
				? "text-info"
				: "text-muted-foreground";

	return (
		<div
			className={cn(
				"mb-3 rounded-lg border bg-card shadow-xs transition-colors",
				toneRing,
			)}
		>
			<div className="flex items-center justify-between gap-3 px-4 py-2.5">
				<div className="flex min-w-0 items-center gap-2 text-sm">
					<Icon className={cn("size-4 shrink-0", iconTone)} />
					<span className="font-medium">{title}</span>
					<span className="truncate text-xs text-muted-foreground">
						{description}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge variant={badgeVariant}>{badgeLabel}</Badge>
					<Switch
						checked={checked}
						onCheckedChange={onCheckedChange}
					/>
				</div>
			</div>
			{active && children && (
				<div className="space-y-2 border-t border-border/60 px-4 py-3">
					{children}
				</div>
			)}
		</div>
	);
}

interface ServicePlan {
	id: string;
	name: string;
	downloadSpeed: number;
	uploadSpeed: number;
	monthlyPrice: number;
}

function ServicePlanSelector({
	plans,
	isLoading,
	form,
}: {
	plans: ServicePlan[];
	isLoading: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: form type is complex and inferred from useForm
	form: { Field: any };
}) {
	const [search, setSearch] = useState("");

	if (isLoading) {
		return (
			<p className="mt-2 text-xs text-muted-foreground">
				Loading plans...
			</p>
		);
	}

	if (plans.length === 0) {
		return (
			<p className="mt-2 text-xs text-muted-foreground">
				No active service plans found. Add plans in the Service Plans
				page for the agent to reference.
			</p>
		);
	}

	return (
		<form.Field name="servicePlanIds">
			{(field: {
				state: { value: string[] };
				handleChange: (val: string[]) => void;
			}) => {
				const selectedIds = field.state.value;
				const allSelected =
					selectedIds.length === 0 ||
					selectedIds.length === plans.length;

				const filteredPlans = search
					? plans.filter((p) =>
							p.name.toLowerCase().includes(search.toLowerCase()),
						)
					: plans;

				const visibleCount = allSelected
					? plans.length
					: selectedIds.length;

				function togglePlan(planId: string) {
					const current = allSelected
						? plans.map((p) => p.id)
						: [...selectedIds];
					const idx = current.indexOf(planId);
					if (idx >= 0) {
						current.splice(idx, 1);
					} else {
						current.push(planId);
					}
					// If all selected again, reset to empty (= all)
					if (current.length === plans.length) {
						field.handleChange([]);
					} else {
						field.handleChange(current);
					}
				}

				function toggleAll() {
					if (allSelected) {
						// Deselect all — but we need at least the concept of "none selected"
						// Since empty = all, we select just the first one to make it non-all
						field.handleChange([]);
					} else {
						// Select all = reset to empty
						field.handleChange([]);
					}
				}

				return (
					<div className="mt-2 space-y-2">
						<div className="flex items-center justify-between">
							<p className="text-xs font-medium text-muted-foreground">
								{allSelected
									? `All ${plans.length} plans visible to agent`
									: `${visibleCount} of ${plans.length} plans visible`}
							</p>
							<button
								type="button"
								onClick={toggleAll}
								className="text-xs text-primary hover:underline"
							>
								{allSelected ? "Select all" : "Reset to all"}
							</button>
						</div>

						{plans.length > 8 && (
							<div className="relative">
								<SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									placeholder="Search plans..."
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									className="h-8 pl-8 text-xs"
								/>
							</div>
						)}

						<div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-1">
							{filteredPlans.map((plan) => {
								const checked = allSelected
									? true
									: selectedIds.includes(plan.id);
								return (
									<label
										key={plan.id}
										htmlFor={`plan-${plan.id}`}
										className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
									>
										<Checkbox
											id={`plan-${plan.id}`}
											checked={checked}
											onCheckedChange={() =>
												togglePlan(plan.id)
											}
										/>
										<span className="flex-1 font-medium">
											{plan.name}
										</span>
										<span className="text-muted-foreground tabular-nums">
											{plan.downloadSpeed}/
											{plan.uploadSpeed} Mbps &middot; $
											{plan.monthlyPrice}/mo
										</span>
									</label>
								);
							})}
							{filteredPlans.length === 0 && (
								<p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
									No plans match "{search}"
								</p>
							)}
						</div>
					</div>
				);
			}}
		</form.Field>
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
	const { plans: servicePlans, isLoading: isLoadingPlans } = usePlansQuery();
	const activePlans = servicePlans.filter((p) => !p.archived);

	const [configDialog, setConfigDialog] = useState<{
		toolId: string;
		toolName: string;
		configFields: Array<{
			key: string;
			label: string;
			type: "text" | "password" | "select" | "textarea" | "repeater";
			required: boolean;
			placeholder?: string | undefined;
			description?: string | undefined;
			options?: Array<{ label: string; value: string }> | undefined;
		}>;
		defaultPromptSection?: string | undefined;
	} | null>(null);

	const toolConfigMap: Record<string, Record<string, unknown>> = {};
	const toolPromptSectionMap: Record<string, string | null> = {};
	for (const tc of agent.toolConfigs) {
		toolConfigMap[tc.toolId] = tc.config as Record<string, unknown>;
		toolPromptSectionMap[tc.toolId] = tc.promptSection ?? null;
	}

	const agentPromptSections = (
		Array.isArray(agent.promptSections) &&
		(agent.promptSections as unknown as PromptSection[]).length > 0
			? agent.promptSections
			: DEFAULT_PROMPT_SECTIONS
	) as PromptSection[];

	const form = useForm({
		defaultValues: {
			name: agent.name,
			description: agent.description ?? "",
			systemPrompt: agent.systemPrompt,
			greetingMessage: agent.greetingMessage ?? "",
			model: agent.model,
			knowledgeBase: agent.knowledgeBase ?? "",
			enabled: agent.enabled,
			servicePlansEnabled: agent.servicePlansEnabled,
			servicePlanIds: agent.servicePlanIds as string[],
			maintenanceMode: agent.maintenanceMode,
			maintenanceMessage: agent.maintenanceMessage ?? "",
			maxHistoryLength: agent.maxHistoryLength,
			temperature: agent.temperature,
			enabledTools: agent.enabledTools as string[],
			contextGapThresholdMinutes: agent.contextGapThresholdMinutes,
			humanTakeoverEnabled: agent.humanTakeoverHours != null,
			humanTakeoverHours: agent.humanTakeoverHours ?? 4,
			promptSections: agentPromptSections,
		},
		onSubmit: async ({ value }) => {
			try {
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
					servicePlansEnabled: value.servicePlansEnabled,
					servicePlanIds: value.servicePlanIds,
					maintenanceMode: value.maintenanceMode,
					maintenanceMessage: value.maintenanceMessage || undefined,
					maxHistoryLength: value.maxHistoryLength,
					temperature: value.temperature,
					enabledTools: value.enabledTools,
					contextGapThresholdMinutes:
						value.contextGapThresholdMinutes,
					humanTakeoverHours: value.humanTakeoverEnabled
						? value.humanTakeoverHours
						: null,
					promptSections: value.promptSections,
				});
				toast.success("Settings saved");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to save settings",
				);
			}
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
				{/* Agent status — compact toggle bar. The agent name already
				    lives in the PageShell header; this only exposes the
				    on/off switch + a one-liner status so operators can pause
				    the agent while editing settings. */}
				<form.Field name="enabled">
					{(field) => (
						<ToggleCard
							icon={BotIcon}
							title="Agent status"
							description={
								field.state.value
									? "Responding to messages"
									: "Paused — no replies will be sent"
							}
							active={field.state.value}
							badgeLabel={
								field.state.value ? "Active" : "Disabled"
							}
							badgeVariant={
								field.state.value ? "default" : "secondary"
							}
							checked={field.state.value}
							onCheckedChange={field.handleChange}
						/>
					)}
				</form.Field>

				{/* Maintenance Mode — compact toggle bar that expands below when on. */}
				<form.Field name="maintenanceMode">
					{(modeField) => (
						<ToggleCard
							icon={AlertTriangleIcon}
							title="Maintenance mode"
							description={
								modeField.state.value
									? "Customers see your maintenance message"
									: "Inform customers about known issues or outages"
							}
							active={modeField.state.value}
							activeTone="warning"
							badgeLabel={
								modeField.state.value ? "Active" : "Off"
							}
							badgeVariant={
								modeField.state.value ? "warning" : "secondary"
							}
							checked={modeField.state.value}
							onCheckedChange={modeField.handleChange}
						>
							{modeField.state.value && (
								<form.Field name="maintenanceMessage">
									{(msgField) => (
										<Field>
											<FieldLabel
												htmlFor="maintenance-message"
												className="text-xs"
											>
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
											/>
										</Field>
									)}
								</form.Field>
							)}
						</ToggleCard>
					)}
				</form.Field>

				{/* Human Takeover — same toggle bar shape, blue tone when active. */}
				<form.Field name="humanTakeoverEnabled">
					{(enabledField) => (
						<ToggleCard
							icon={HandIcon}
							title="Human takeover"
							description={
								enabledField.state.value
									? "AI pauses when a human messages from the linked phone"
									: "Pause AI when a human sends a message from the linked phone"
							}
							active={enabledField.state.value}
							activeTone="info"
							badgeLabel={
								enabledField.state.value ? "Active" : "Off"
							}
							badgeVariant={
								enabledField.state.value
									? "default"
									: "secondary"
							}
							checked={enabledField.state.value}
							onCheckedChange={enabledField.handleChange}
						>
							{enabledField.state.value && (
								<form.Field name="humanTakeoverHours">
									{(hoursField) => (
										<Field>
											<FieldLabel
												htmlFor="takeover-hours"
												className="text-xs"
											>
												Pause duration (hours)
												<FieldHint text="How long the AI stays paused after a human message. After this time, the AI will automatically resume responding." />
											</FieldLabel>
											<div className="flex items-center gap-2">
												<Input
													id="takeover-hours"
													type="number"
													min={0.5}
													max={48}
													step={0.5}
													value={
														hoursField.state.value
													}
													onChange={(e) =>
														hoursField.handleChange(
															Number.parseFloat(
																e.target.value,
															) || 4,
														)
													}
													onBlur={
														hoursField.handleBlur
													}
													className="w-24"
												/>
												<span className="text-sm text-muted-foreground">
													hours
												</span>
											</div>
										</Field>
									)}
								</form.Field>
							)}
						</ToggleCard>
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
												<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
														className="w-full sm:w-auto"
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

									<Separator />

									<form.Field name="servicePlansEnabled">
										{(field) => (
											<div className="rounded-lg border p-4 space-y-3">
												<div className="flex items-center justify-between">
													<div className="space-y-0.5">
														<FieldLabel htmlFor="settings-service-plans">
															Service Plans
															Awareness
															<FieldHint text="When enabled, the agent can see your organization's service plans and answer questions about pricing, speeds, and packages." />
														</FieldLabel>
														<p className="text-xs text-muted-foreground">
															Let the agent answer
															questions about your
															plans and pricing
														</p>
													</div>
													<Switch
														id="settings-service-plans"
														checked={
															field.state.value
														}
														onCheckedChange={
															field.handleChange
														}
													/>
												</div>
												{field.state.value && (
													<ServicePlanSelector
														plans={activePlans}
														isLoading={
															isLoadingPlans
														}
														form={form}
													/>
												)}
											</div>
										)}
									</form.Field>
								</div>
							</AccordionContent>
						</AccordionItem>
					</Card>

					{/* Prompt Sections */}
					<Card>
						<AccordionItem
							value="prompt-sections"
							className="border-b-0"
						>
							<AccordionTrigger className="px-6 py-4 hover:no-underline">
								<div className="flex items-center gap-2.5">
									<FileTextIcon className="size-4 text-muted-foreground" />
									<span className="font-semibold">
										Prompt Sections
									</span>
									<Badge variant="secondary" className="ml-1">
										{agentPromptSections.length}
									</Badge>
								</div>
							</AccordionTrigger>
							<AccordionContent className="px-6 pb-6">
								<p className="mb-4 text-sm text-muted-foreground">
									Configurable instruction blocks injected
									into the system prompt. Toggle, edit, or
									reset each section.
								</p>
								<form.Field name="promptSections">
									{(field) => (
										<div className="space-y-4">
											{field.state.value.map(
												(
													section: PromptSection,
													index: number,
												) => {
													const defaultSection =
														DEFAULT_PROMPT_SECTIONS.find(
															(d) =>
																d.id ===
																section.id,
														);
													const isModified =
														defaultSection &&
														section.content !==
															defaultSection.content;
													return (
														<div
															key={section.id}
															className="rounded-lg border p-4 space-y-3"
														>
															<div className="flex flex-wrap items-center justify-between gap-2">
																<div className="flex items-center gap-2">
																	<Switch
																		checked={
																			section.enabled
																		}
																		onCheckedChange={(
																			checked,
																		) => {
																			const updated =
																				[
																					...field
																						.state
																						.value,
																				];
																			updated[
																				index
																			] =
																				{
																					...section,
																					enabled:
																						checked,
																				};
																			field.handleChange(
																				updated,
																			);
																		}}
																	/>
																	<span className="text-sm font-medium">
																		{
																			section.label
																		}
																	</span>
																	{section.condition && (
																		<Badge
																			variant="outline"
																			className="text-[10px]"
																		>
																			{
																				section.condition
																			}
																		</Badge>
																	)}
																</div>
																{isModified && (
																	<Button
																		type="button"
																		variant="ghost"
																		size="sm"
																		onClick={() => {
																			const updated =
																				[
																					...field
																						.state
																						.value,
																				];
																			updated[
																				index
																			] =
																				{
																					...section,
																					content:
																						defaultSection.content,
																				};
																			field.handleChange(
																				updated,
																			);
																		}}
																	>
																		<RotateCcwIcon className="size-3.5 mr-1" />
																		Reset
																	</Button>
																)}
															</div>
															{section.enabled && (
																<Textarea
																	value={
																		section.content
																	}
																	onChange={(
																		e,
																	) => {
																		const updated =
																			[
																				...field
																					.state
																					.value,
																			];
																		updated[
																			index
																		] = {
																			...section,
																			content:
																				e
																					.target
																					.value,
																		};
																		field.handleChange(
																			updated,
																		);
																	}}
																	rows={6}
																	className="font-mono text-xs"
																/>
															)}
														</div>
													);
												},
											)}
										</div>
									)}
								</form.Field>
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
										{(field) => {
											const selected =
												AI_MODEL_OPTIONS.find(
													(m) =>
														m.id ===
														field.state.value,
												);
											return (
												<Field>
													<FieldLabel>
														Model
														<FieldHint text="The AI model powering this agent. All models are routed through OpenRouter." />
													</FieldLabel>
													<Select
														value={
															field.state.value
														}
														onValueChange={
															field.handleChange
														}
													>
														<SelectTrigger>
															<SelectValue>
																{selected && (
																	<span className="flex items-center gap-2">
																		{
																			selected.label
																		}
																		<span className="text-[10px] text-muted-foreground">
																			$
																			{
																				selected.priceIn
																			}
																			/$
																			{
																				selected.priceOut
																			}
																		</span>
																	</span>
																)}
															</SelectValue>
														</SelectTrigger>
														<SelectContent>
															{AI_MODEL_GROUPS.map(
																(group) => (
																	<SelectGroup
																		key={
																			group.label
																		}
																	>
																		<SelectLabel>
																			{
																				group.label
																			}
																		</SelectLabel>
																		{group.models.map(
																			(
																				m,
																			) => (
																				<SelectItem
																					key={
																						m.id
																					}
																					value={
																						m.id
																					}
																				>
																					<div className="flex items-center gap-2 w-full">
																						<span>
																							{
																								m.label
																							}
																						</span>
																						{m.recommended && (
																							<Badge className="text-[9px] px-1 py-0 leading-tight">
																								recommended
																							</Badge>
																						)}
																						<span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
																							$
																							{
																								m.priceIn
																							}
																							/$
																							{
																								m.priceOut
																							}
																						</span>
																					</div>
																				</SelectItem>
																			),
																		)}
																	</SelectGroup>
																),
															)}
														</SelectContent>
													</Select>
													{selected && (
														<p className="text-[11px] text-muted-foreground mt-1">
															Cost per 1M tokens:
															${selected.priceIn}{" "}
															input / $
															{selected.priceOut}{" "}
															output
														</p>
													)}
												</Field>
											);
										}}
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

									<form.Field name="contextGapThresholdMinutes">
										{(field) => {
											const hours =
												field.state.value / 60;
											const label =
												hours >= 1
													? `${hours}h`
													: `${field.state.value}m`;
											return (
												<Field>
													<FieldLabel>
														Session gap threshold:{" "}
														<span className="font-mono text-primary">
															{label}
														</span>
														<FieldHint text="After this period of inactivity, the agent is reminded that time has passed — so it won't assume the customer is continuing the same topic." />
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
														min={60}
														max={1440}
														step={30}
													/>
													<div className="flex justify-between text-[10px] text-muted-foreground">
														<span>1 hour</span>
														<span>24 hours</span>
													</div>
												</Field>
											);
										}}
									</form.Field>
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
																<div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
																	<label
																		htmlFor={`tool-${tool.id}`}
																		className="text-sm font-medium cursor-pointer"
																	>
																		{
																			tool.name
																		}
																	</label>
																	<code className="hidden text-[10px] text-muted-foreground/70 font-mono sm:inline">
																		{
																			tool.id
																		}
																	</code>
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
																				defaultPromptSection:
																					tool.defaultPromptSection,
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
					existingPromptSection={
						toolPromptSectionMap[configDialog.toolId]
					}
					defaultPromptSection={configDialog.defaultPromptSection}
				/>
			)}
		</TooltipProvider>
	);
}
