"use client";

import { Button } from "@ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { PlusIcon, RadioIcon } from "lucide-react";
import { useState } from "react";
import { useChannels, useDeleteChannel } from "../hooks/use-channels";
import { ChannelCard } from "./ChannelCard";
import { CreateChannelDialog } from "./CreateChannelDialog";

export function ChannelsList({
	agentId,
	organizationId,
}: {
	agentId: string;
	organizationId: string;
}) {
	const { channels } = useChannels(agentId, organizationId);
	const deleteChannel = useDeleteChannel();
	const [showCreate, setShowCreate] = useState(false);

	const handleDelete = async (channelId: string) => {
		await deleteChannel.mutateAsync({ channelId, organizationId });
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Channels</CardTitle>
						<CardDescription>
							Connect messaging platforms to this agent
						</CardDescription>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowCreate(true)}
					>
						<PlusIcon className="mr-2 size-4" />
						Add Channel
					</Button>
				</div>
			</CardHeader>

			<CardContent>
				{channels.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
						<RadioIcon className="mb-3 size-8 text-muted-foreground/50" />
						<p className="mb-3 text-sm text-muted-foreground">
							No channels configured yet.
						</p>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowCreate(true)}
						>
							<PlusIcon className="mr-2 size-4" />
							Add WhatsApp or Telegram
						</Button>
					</div>
				) : (
					<div className="space-y-3">
						{channels.map((channel) => (
							<ChannelCard
								key={channel.id}
								channel={channel}
								onDelete={handleDelete}
							/>
						))}
					</div>
				)}
			</CardContent>

			<CreateChannelDialog
				agentId={agentId}
				organizationId={organizationId}
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
		</Card>
	);
}
