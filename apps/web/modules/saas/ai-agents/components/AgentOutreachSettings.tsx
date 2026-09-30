"use client";

import { useForm } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Card } from "@ui/components/card";
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Switch } from "@ui/components/switch";
import { MegaphoneIcon } from "lucide-react";
import { toast } from "sonner";
import { useUpdateAgent } from "../hooks/use-agents";

/** The agent fields this card edits (from `aiAgents.getAgent`). */
export interface OutreachSettingsAgent {
	provider: string;
	postEscalationCheckMinutes: number | null;
	conversationSummaryMode: string;
	conversationSummaryIdleMinutes: number;
	outreachRequireApproval: boolean;
	postInstallFollowUpDays: number | null;
	postStopFollowUpEnabled: boolean;
	postStopFollowUpTime: string;
	voiceReplies: boolean;
}

const CHECK_BACK_OPTIONS = [
	{ value: "off", label: "Off" },
	{ value: "240", label: "After 4 hours" },
	{ value: "1440", label: "Next day" },
	{ value: "2880", label: "After 2 days" },
];

const SUMMARY_MODES = [
	{ value: "off", label: "Off" },
	{ value: "each", label: "Each conversation" },
	{ value: "digest", label: "Daily digest (21:00)" },
];

const INSTALL_DAYS = [
	{ value: "off", label: "Off" },
	{ value: "1", label: "1 day after" },
	{ value: "2", label: "2 days after" },
	{ value: "3", label: "3 days after" },
	{ value: "5", label: "5 days after" },
	{ value: "7", label: "7 days after" },
];

/**
 * Follow-ups beyond the silence nudge: the check-back after an escalation,
 * conversation summaries to Telegram, official-number outreach (install
 * satisfaction, day-after-a-stop) and spoken replies. Everything ships off.
 */
export function AgentOutreachSettings({
	agentId,
	organizationId,
	agent,
}: {
	agentId: string;
	organizationId: string;
	agent: OutreachSettingsAgent;
}) {
	const updateAgent = useUpdateAgent();
	const form = useForm({
		defaultValues: {
			checkBack:
				agent.postEscalationCheckMinutes == null
					? "off"
					: String(agent.postEscalationCheckMinutes),
			summaryMode: agent.conversationSummaryMode,
			summaryIdleMinutes: agent.conversationSummaryIdleMinutes,
			requireApproval: agent.outreachRequireApproval,
			installDays:
				agent.postInstallFollowUpDays == null
					? "off"
					: String(agent.postInstallFollowUpDays),
			stopEnabled: agent.postStopFollowUpEnabled,
			stopTime: agent.postStopFollowUpTime,
			voiceReplies: agent.voiceReplies,
		},
		onSubmit: async ({ value }) => {
			try {
				await updateAgent.mutateAsync({
					agentId,
					organizationId,
					postEscalationCheckMinutes:
						value.checkBack === "off"
							? null
							: Number(value.checkBack),
					conversationSummaryMode: value.summaryMode as
						| "off"
						| "each"
						| "digest",
					conversationSummaryIdleMinutes: value.summaryIdleMinutes,
					outreachRequireApproval: value.requireApproval,
					postInstallFollowUpDays:
						value.installDays === "off"
							? null
							: Number(value.installDays),
					postStopFollowUpEnabled: value.stopEnabled,
					postStopFollowUpTime: value.stopTime,
					voiceReplies: value.voiceReplies,
				});
				toast.success("Follow-up settings saved");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to save settings",
				);
			}
		},
	});

	return (
		<Card className="mb-3 space-y-4 px-4 py-4">
			<div className="flex items-center gap-2 text-sm">
				<MegaphoneIcon className="size-4 text-muted-foreground" />
				<span className="font-medium">
					Check-backs, summaries & outreach
				</span>
				<span className="truncate text-xs text-muted-foreground">
					All off by default
				</span>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="checkBack">
					{(f) => (
						<Field>
							<FieldLabel className="text-xs">
								Check back after an escalation
							</FieldLabel>
							<Select
								value={f.state.value}
								onValueChange={f.handleChange}
							>
								<SelectTrigger className="w-48">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CHECK_BACK_OPTIONS.map((o) => (
										<SelectItem
											key={o.value}
											value={o.value}
										>
											{o.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Asks in the chat whether the team reached the
								customer. "Solved" closes the escalation task;
								"not solved" reopens it and alerts Telegram.
								Sent inside the follow-up hours.
							</p>
						</Field>
					)}
				</form.Field>

				<div className="space-y-2">
					<form.Field name="summaryMode">
						{(f) => (
							<Field>
								<FieldLabel className="text-xs">
									Conversation summaries to Telegram
								</FieldLabel>
								<Select
									value={f.state.value}
									onValueChange={f.handleChange}
								>
									<SelectTrigger className="w-48">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{SUMMARY_MODES.map((o) => (
											<SelectItem
												key={o.value}
												value={o.value}
											>
												{o.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
					<form.Field name="summaryIdleMinutes">
						{(f) => (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<span>After</span>
								<Input
									type="number"
									min={10}
									max={720}
									value={f.state.value}
									onChange={(e) =>
										f.handleChange(
											Math.min(
												720,
												Math.max(
													10,
													Number.parseInt(
														e.target.value,
														10,
													) || 30,
												),
											),
										)
									}
									className="w-20"
								/>
								<span>idle minutes</span>
							</div>
						)}
					</form.Field>
				</div>
			</div>

			<div className="space-y-3 rounded-md border border-border/60 p-3">
				<p className="text-xs font-medium">
					Official-number outreach (Salti templates)
				</p>
				<form.Field name="requireApproval">
					{(f) => (
						<div className="flex items-center justify-between gap-3 text-sm">
							<span>
								Wait for approval on the Bot follow-ups page
								before sending
							</span>
							<Switch
								checked={f.state.value}
								onCheckedChange={f.handleChange}
							/>
						</div>
					)}
				</form.Field>
				<div className="grid gap-4 sm:grid-cols-2">
					<form.Field name="installDays">
						{(f) => (
							<Field>
								<FieldLabel className="text-xs">
									Install satisfaction check (11:00)
								</FieldLabel>
								<Select
									value={f.state.value}
									onValueChange={f.handleChange}
								>
									<SelectTrigger className="w-48">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{INSTALL_DAYS.map((o) => (
											<SelectItem
												key={o.value}
												value={o.value}
											>
												{o.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
					<div className="space-y-2">
						<form.Field name="stopEnabled">
							{(f) => (
								<div className="flex items-center justify-between gap-3 text-sm">
									<span>Ask why, the day after a stop</span>
									<Switch
										checked={f.state.value}
										onCheckedChange={f.handleChange}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="stopTime">
							{(f) => (
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<span>At (Beirut)</span>
									<Input
										type="time"
										value={f.state.value}
										onChange={(e) =>
											f.handleChange(e.target.value)
										}
										className="w-32"
									/>
								</div>
							)}
						</form.Field>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">
					Nothing is sent until the Salti template names are set on
					the server; rows are skipped with "template not configured"
					until then.
				</p>
			</div>

			<form.Field name="voiceReplies">
				{(f) => (
					<div className="flex items-center justify-between gap-3 text-sm">
						<span>
							Answer voice notes with a voice note too
							<span className="block text-xs text-muted-foreground">
								{agent.provider === "openai"
									? "Short replies only; the text is always sent as well."
									: "Needs an OpenAI (direct) key — with this provider only the text is sent."}
							</span>
						</span>
						<Switch
							checked={f.state.value}
							onCheckedChange={f.handleChange}
						/>
					</div>
				)}
			</form.Field>

			<div className="flex justify-end">
				<form.Subscribe selector={(st) => st.isSubmitting}>
					{(isSubmitting) => (
						<Button
							type="button"
							size="sm"
							disabled={isSubmitting}
							onClick={() => form.handleSubmit()}
						>
							{isSubmitting
								? "Saving..."
								: "Save follow-up settings"}
						</Button>
					)}
				</form.Subscribe>
			</div>
		</Card>
	);
}
