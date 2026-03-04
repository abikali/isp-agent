"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
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
import { Textarea } from "@ui/components/textarea";
import {
	CheckCircleIcon,
	LoaderIcon,
	PlusIcon,
	SendIcon,
	TrashIcon,
	XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { useTestTelegramConfig, useUpdateToolConfig } from "../hooks/use-tools";

interface ConfigField {
	key: string;
	label: string;
	type: "text" | "password" | "select" | "textarea" | "repeater";
	required: boolean;
	placeholder?: string | undefined;
	defaultValue?: string | undefined;
	description?: string | undefined;
	options?: Array<{ label: string; value: string }> | undefined;
}

interface ToolConfigDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	agentId: string;
	organizationId: string;
	toolId: string;
	toolName: string;
	configFields: ConfigField[];
	existingConfig?: Record<string, unknown> | undefined;
	existingPromptSection?: string | null | undefined;
	defaultPromptSection?: string | undefined;
}

/**
 * Parse existing config value for a repeater field.
 * Handles both array format (new) and newline-separated string (legacy).
 */
function parseRepeaterValue(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
	}
	if (typeof value === "string" && value.length > 0) {
		return value
			.split(/[\n,]+/)
			.map((v) => v.trim())
			.filter((v) => v.length > 0);
	}
	return [];
}

interface TestResult {
	botValid: boolean;
	botName: string | null;
	error: string | null;
	results: Array<{ chatId: string; success: boolean; error?: string }>;
}

export function ToolConfigDialog({
	open,
	onOpenChange,
	agentId,
	organizationId,
	toolId,
	toolName,
	configFields,
	existingConfig,
	existingPromptSection,
	defaultPromptSection,
}: ToolConfigDialogProps) {
	const updateToolConfig = useUpdateToolConfig();
	const testTelegram = useTestTelegramConfig();

	// Separate repeater fields from regular fields
	const repeaterFields = configFields.filter((f) => f.type === "repeater");
	const regularFields = configFields.filter((f) => f.type !== "repeater");

	// Build default values for regular (non-repeater) fields
	const defaultValues: Record<string, string> = {};
	for (const field of regularFields) {
		defaultValues[field.key] =
			(existingConfig?.[field.key] as string) ?? field.defaultValue ?? "";
	}

	// Manage repeater state separately
	const initialRepeaterState: Record<string, string[]> = {};
	for (const field of repeaterFields) {
		const parsed = parseRepeaterValue(existingConfig?.[field.key]);
		initialRepeaterState[field.key] = parsed.length > 0 ? parsed : [""];
	}

	const [repeaterValues, setRepeaterValues] = useState(initialRepeaterState);
	const [promptSectionValue, setPromptSectionValue] = useState(
		existingPromptSection ?? "",
	);
	const [testResult, setTestResult] = useState<TestResult | null>(null);

	const isTelegramTool = toolId === "escalate-telegram";

	function addRepeaterItem(key: string) {
		setRepeaterValues((prev) => ({
			...prev,
			[key]: [...(prev[key] ?? []), ""],
		}));
	}

	function removeRepeaterItem(key: string, index: number) {
		setRepeaterValues((prev) => {
			const items = prev[key] ?? [];
			if (items.length <= 1) {
				return prev;
			}
			return {
				...prev,
				[key]: items.filter((_, i) => i !== index),
			};
		});
	}

	function updateRepeaterItem(key: string, index: number, value: string) {
		setRepeaterValues((prev) => ({
			...prev,
			[key]: (prev[key] ?? []).map((item, i) =>
				i === index ? value : item,
			),
		}));
	}

	async function handleTest() {
		setTestResult(null);

		const botToken = form.getFieldValue("telegramBotToken");
		const chatIds = (repeaterValues["telegramChatIds"] ?? [])
			.map((v) => v.trim())
			.filter((v) => v.length > 0);

		if (!botToken || chatIds.length === 0) {
			return;
		}

		const result = await testTelegram.mutateAsync({
			organizationId,
			botToken,
			chatIds,
		});

		setTestResult(result);
	}

	const form = useForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			const config: Record<string, unknown> = {};

			for (const field of regularFields) {
				if (value[field.key]) {
					config[field.key] = value[field.key];
				}
			}

			for (const field of repeaterFields) {
				const items = (repeaterValues[field.key] ?? [])
					.map((v) => v.trim())
					.filter((v) => v.length > 0);
				if (items.length > 0) {
					config[field.key] = items;
				}
			}

			await updateToolConfig.mutateAsync({
				agentId,
				organizationId,
				toolId,
				config,
				promptSection: promptSectionValue || undefined,
			});
			onOpenChange(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Configure {toolName}</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					{configFields.map((field) => {
						if (field.type === "repeater") {
							const items = repeaterValues[field.key] ?? [""];
							return (
								<Field key={field.key}>
									<FieldLabel>
										{field.label}
										{field.required ? " *" : ""}
									</FieldLabel>
									<div className="space-y-2">
										{items.map((item, index) => (
											<div
												key={`${field.key}-${index}`}
												className="flex items-center gap-2"
											>
												<Input
													value={item}
													onChange={(e) =>
														updateRepeaterItem(
															field.key,
															index,
															e.target.value,
														)
													}
													placeholder={
														field.placeholder ?? ""
													}
													className="flex-1"
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() =>
														removeRepeaterItem(
															field.key,
															index,
														)
													}
													disabled={items.length <= 1}
													className="text-muted-foreground hover:text-destructive shrink-0"
												>
													<TrashIcon className="size-4" />
												</Button>
											</div>
										))}
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() =>
												addRepeaterItem(field.key)
											}
											className="w-full"
										>
											<PlusIcon className="mr-1.5 size-3.5" />
											Add Chat ID
										</Button>
									</div>
									{field.description && (
										<p className="text-muted-foreground text-xs">
											{field.description}
										</p>
									)}
								</Field>
							);
						}

						return (
							<form.Field key={field.key} name={field.key}>
								{(formField) => (
									<Field>
										<FieldLabel
											htmlFor={`config-${field.key}`}
										>
											{field.label}
											{field.required ? " *" : ""}
										</FieldLabel>
										{field.type === "select" &&
										field.options ? (
											<Select
												value={formField.state.value}
												onValueChange={
													formField.handleChange
												}
											>
												<SelectTrigger
													id={`config-${field.key}`}
												>
													<SelectValue
														placeholder={
															field.placeholder ??
															"Select..."
														}
													/>
												</SelectTrigger>
												<SelectContent>
													{field.options.map(
														(opt) => (
															<SelectItem
																key={opt.value}
																value={
																	opt.value
																}
															>
																{opt.label}
															</SelectItem>
														),
													)}
												</SelectContent>
											</Select>
										) : field.type === "textarea" ? (
											<Textarea
												id={`config-${field.key}`}
												rows={3}
												value={formField.state.value}
												onChange={(e) =>
													formField.handleChange(
														e.target.value,
													)
												}
												onBlur={formField.handleBlur}
												placeholder={
													field.placeholder ?? ""
												}
											/>
										) : (
											<Input
												id={`config-${field.key}`}
												type={
													field.type === "password"
														? "password"
														: "text"
												}
												value={formField.state.value}
												onChange={(e) =>
													formField.handleChange(
														e.target.value,
													)
												}
												onBlur={formField.handleBlur}
												placeholder={
													field.placeholder ?? ""
												}
											/>
										)}
										{field.description && (
											<p className="text-muted-foreground text-xs">
												{field.description}
											</p>
										)}
									</Field>
								)}
							</form.Field>
						);
					})}

					{defaultPromptSection && (
						<>
							<Separator />
							<Field>
								<div className="flex items-center justify-between">
									<FieldLabel htmlFor="tool-prompt-section">
										Prompt Instructions
									</FieldLabel>
									{promptSectionValue &&
										promptSectionValue !==
											defaultPromptSection && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() =>
													setPromptSectionValue(
														defaultPromptSection,
													)
												}
											>
												Reset to default
											</Button>
										)}
								</div>
								<Textarea
									id="tool-prompt-section"
									rows={6}
									value={promptSectionValue}
									onChange={(e) =>
										setPromptSectionValue(e.target.value)
									}
									placeholder={defaultPromptSection}
								/>
								<p className="text-muted-foreground text-xs">
									Behavioral instructions injected into the
									system prompt when this tool is enabled.
									Leave empty to use the default.
								</p>
							</Field>
						</>
					)}

					{isTelegramTool && (
						<>
							<Separator />
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<p className="text-sm font-medium">
										Test Configuration
									</p>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleTest}
										disabled={testTelegram.isPending}
									>
										{testTelegram.isPending ? (
											<LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
										) : (
											<SendIcon className="mr-1.5 size-3.5" />
										)}
										{testTelegram.isPending
											? "Testing..."
											: "Send Test Message"}
									</Button>
								</div>

								{testTelegram.isError && (
									<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
										<p className="text-destructive text-sm">
											Failed to run test. Check your
											connection and try again.
										</p>
									</div>
								)}

								{testResult && (
									<div className="space-y-2">
										{/* Bot token validation */}
										<div className="flex items-center gap-2">
											{testResult.botValid ? (
												<CheckCircleIcon className="text-success size-4 shrink-0" />
											) : (
												<XCircleIcon className="text-destructive size-4 shrink-0" />
											)}
											<span className="text-sm">
												{testResult.botValid
													? `Bot verified: @${testResult.botName}`
													: testResult.error}
											</span>
											<Badge
												variant={
													testResult.botValid
														? "success"
														: "error"
												}
												className="ml-auto"
											>
												{testResult.botValid
													? "Valid"
													: "Invalid"}
											</Badge>
										</div>

										{/* Per-recipient results */}
										{testResult.results.length > 0 && (
											<div className="divide-border divide-y rounded-md border">
												{testResult.results.map((r) => (
													<div
														key={r.chatId}
														className="flex items-start gap-2 p-2.5"
													>
														{r.success ? (
															<CheckCircleIcon className="text-success mt-0.5 size-4 shrink-0" />
														) : (
															<XCircleIcon className="text-destructive mt-0.5 size-4 shrink-0" />
														)}
														<div className="min-w-0 flex-1">
															<div className="flex items-center gap-2">
																<code className="text-xs">
																	{r.chatId}
																</code>
																<Badge
																	variant={
																		r.success
																			? "success"
																			: "error"
																	}
																>
																	{r.success
																		? "Delivered"
																		: "Failed"}
																</Badge>
															</div>
															{r.error && (
																<p className="text-muted-foreground mt-1 text-xs">
																	{r.error}
																</p>
															)}
														</div>
													</div>
												))}
											</div>
										)}
									</div>
								)}
							</div>
						</>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Saving..." : "Save Configuration"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
