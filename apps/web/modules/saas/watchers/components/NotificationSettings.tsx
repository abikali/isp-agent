"use client";

import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Switch } from "@ui/components/switch";
import { MailIcon, MessageSquareIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useMessagingChannels } from "../hooks/use-watchers";
import { REMINDER_INTERVAL_OPTIONS } from "../lib/constants";

interface NotificationChannel {
	type: "email" | "whatsapp" | "telegram";
	email?: string | undefined;
	channelId?: string | undefined;
	chatId?: string | undefined;
	enabled: boolean;
}

export interface NotificationConfig {
	channels: NotificationChannel[];
	events: {
		down: boolean;
		recovery: boolean;
		reminder: boolean;
	};
	reminderIntervalMinutes?: number | undefined;
}

/**
 * Convert the frontend notification config to the shape expected by the API.
 * The API uses a zod discriminated union, so we need to narrow channels by type.
 */
export function toApiNotificationConfig(config: NotificationConfig):
	| {
			channels: (
				| { type: "email"; email: string; enabled: boolean }
				| {
						type: "whatsapp" | "telegram";
						channelId: string;
						chatId: string;
						enabled: boolean;
				  }
			)[];
			events: { down: boolean; recovery: boolean; reminder: boolean };
			reminderIntervalMinutes?: number | undefined;
	  }
	| undefined {
	if (config.channels.length === 0) {
		return undefined;
	}

	const channels = config.channels
		.map((ch) => {
			if (ch.type === "email" && ch.email) {
				return {
					type: "email" as const,
					email: ch.email,
					enabled: ch.enabled,
				};
			}
			if (
				(ch.type === "whatsapp" || ch.type === "telegram") &&
				ch.channelId &&
				ch.chatId
			) {
				return {
					type: ch.type,
					channelId: ch.channelId,
					chatId: ch.chatId,
					enabled: ch.enabled,
				};
			}
			return null;
		})
		.filter((ch) => ch !== null);

	return {
		channels,
		events: config.events,
		reminderIntervalMinutes: config.reminderIntervalMinutes,
	};
}

export function NotificationSettings({
	value,
	onChange,
}: {
	value: NotificationConfig;
	onChange: (config: NotificationConfig) => void;
}) {
	const { channels: messagingChannels } = useMessagingChannels();
	const [addingType, setAddingType] = useState<
		"email" | "whatsapp" | "telegram" | null
	>(null);

	function updateEvents(
		key: keyof NotificationConfig["events"],
		val: boolean,
	) {
		onChange({
			...value,
			events: { ...value.events, [key]: val },
		});
	}

	function addChannel(channel: NotificationChannel) {
		onChange({
			...value,
			channels: [...value.channels, channel],
		});
		setAddingType(null);
	}

	function removeChannel(index: number) {
		onChange({
			...value,
			channels: value.channels.filter((_, i) => i !== index),
		});
	}

	function toggleChannel(index: number) {
		const updated = [...value.channels];
		const existing = updated[index];
		if (existing) {
			updated[index] = { ...existing, enabled: !existing.enabled };
			onChange({ ...value, channels: updated });
		}
	}

	return (
		<div className="space-y-4">
			<div className="space-y-3">
				<Label className="text-sm font-medium">Alert Events</Label>
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label
							htmlFor="event-down"
							className="text-sm font-normal"
						>
							Alert when down
						</Label>
						<Switch
							id="event-down"
							checked={value.events.down}
							onCheckedChange={(v) => updateEvents("down", v)}
						/>
					</div>
					<div className="flex items-center justify-between">
						<Label
							htmlFor="event-recovery"
							className="text-sm font-normal"
						>
							Alert on recovery
						</Label>
						<Switch
							id="event-recovery"
							checked={value.events.recovery}
							onCheckedChange={(v) => updateEvents("recovery", v)}
						/>
					</div>
					<div className="flex items-center justify-between">
						<Label
							htmlFor="event-reminder"
							className="text-sm font-normal"
						>
							Periodic reminders while down
						</Label>
						<Switch
							id="event-reminder"
							checked={value.events.reminder}
							onCheckedChange={(v) => updateEvents("reminder", v)}
						/>
					</div>
					{value.events.reminder && (
						<div className="ml-0 mt-1">
							<Label className="text-sm font-normal text-muted-foreground">
								Reminder interval
							</Label>
							<Select
								value={String(
									value.reminderIntervalMinutes ?? 60,
								)}
								onValueChange={(v) =>
									onChange({
										...value,
										reminderIntervalMinutes:
											Number.parseInt(v, 10),
									})
								}
							>
								<SelectTrigger className="mt-1 w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{REMINDER_INTERVAL_OPTIONS.map((opt) => (
										<SelectItem
											key={opt.value}
											value={String(opt.value)}
										>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</div>
			</div>

			<div className="space-y-3">
				<Label className="text-sm font-medium">
					Notification Channels
				</Label>

				{value.channels.length > 0 && (
					<div className="space-y-2">
						{value.channels.map((channel, index) => (
							<div
								key={`${channel.type}-${channel.email ?? channel.channelId ?? index}`}
								className="flex items-center justify-between rounded-md border px-3 py-2"
							>
								<div className="flex items-center gap-2">
									<Switch
										checked={channel.enabled}
										onCheckedChange={() =>
											toggleChannel(index)
										}
										aria-label={`Toggle ${channel.type} channel`}
									/>
									{channel.type === "email" ? (
										<MailIcon className="size-4 text-muted-foreground" />
									) : (
										<MessageSquareIcon className="size-4 text-muted-foreground" />
									)}
									<div className="text-sm">
										<span className="capitalize">
											{channel.type}
										</span>
										{channel.type === "email" &&
											channel.email && (
												<span className="ml-1 text-muted-foreground">
													({channel.email})
												</span>
											)}
										{channel.type !== "email" &&
											channel.chatId && (
												<span className="ml-1 text-muted-foreground">
													({channel.chatId})
												</span>
											)}
									</div>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => removeChannel(index)}
								>
									<TrashIcon className="size-4" />
								</Button>
							</div>
						))}
					</div>
				)}

				{addingType === null ? (
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setAddingType("email")}
						>
							<PlusIcon className="mr-1 size-3" />
							Email
						</Button>
						{messagingChannels.length > 0 && (
							<>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setAddingType("whatsapp")}
								>
									<PlusIcon className="mr-1 size-3" />
									WhatsApp
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setAddingType("telegram")}
								>
									<PlusIcon className="mr-1 size-3" />
									Telegram
								</Button>
							</>
						)}
					</div>
				) : (
					<AddChannelForm
						type={addingType}
						messagingChannels={messagingChannels}
						onAdd={addChannel}
						onCancel={() => setAddingType(null)}
					/>
				)}
			</div>
		</div>
	);
}

function AddChannelForm({
	type,
	messagingChannels,
	onAdd,
	onCancel,
}: {
	type: "email" | "whatsapp" | "telegram";
	messagingChannels: Array<{
		id: string;
		provider: string;
		name: string;
		agentName: string;
	}>;
	onAdd: (channel: NotificationChannel) => void;
	onCancel: () => void;
}) {
	const [email, setEmail] = useState("");
	const [channelId, setChannelId] = useState("");
	const [chatId, setChatId] = useState("");

	const filteredChannels = messagingChannels.filter(
		(ch) => ch.provider === type,
	);

	function handleSubmit() {
		if (type === "email") {
			if (!email) {
				return;
			}
			onAdd({ type: "email", email, enabled: true });
		} else {
			if (!channelId || !chatId) {
				return;
			}
			onAdd({ type, channelId, chatId, enabled: true });
		}
	}

	return (
		<div className="space-y-2 rounded-md border p-3">
			<div className="text-sm font-medium capitalize">
				Add {type} Channel
			</div>

			{type === "email" ? (
				<Input
					type="email"
					placeholder="notifications@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			) : (
				<>
					{filteredChannels.length > 0 ? (
						<Select value={channelId} onValueChange={setChannelId}>
							<SelectTrigger>
								<SelectValue placeholder="Select a channel" />
							</SelectTrigger>
							<SelectContent>
								{filteredChannels.map((ch) => (
									<SelectItem key={ch.id} value={ch.id}>
										{ch.name} ({ch.agentName})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<p className="text-sm text-muted-foreground">
							No {type} channels configured. Set up an AI agent
							with a {type} channel first.
						</p>
					)}
					<Input
						placeholder={
							type === "whatsapp"
								? "Phone number (e.g. 1234567890)"
								: "Chat ID"
						}
						value={chatId}
						onChange={(e) => setChatId(e.target.value)}
					/>
				</>
			)}

			<div className="flex gap-2">
				<Button type="button" size="sm" onClick={handleSubmit}>
					Add
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onCancel}
				>
					Cancel
				</Button>
			</div>
		</div>
	);
}
