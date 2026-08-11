"use client";

import { useWorkerOptions } from "@saas/worker-options/client";
import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { formatDateTime } from "@shared/lib/format";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { ImageIcon } from "lucide-react";
import { useState } from "react";

interface EvidenceTask {
	resolutionCode: string | null;
	resolutionNote: string | null;
	completionPhotoUrl: string | null;
	completedAt: Date | string | null;
	completedByEmployee?: { id: string; name: string } | null;
	uninstalledItems?: Array<{
		id: string;
		itemName: string;
		quantity: number;
		pictureUrl: string | null;
		status: string;
		uninstalledAt: Date | string;
	}>;
}

const ITEM_STATUS_VARIANTS: Record<
	string,
	"info" | "success" | "error" | "outline"
> = {
	PENDING: "info",
	APPROVED: "success",
	DENIED: "error",
	COMPLETED: "success",
};

/** Read-only completion evidence: resolution, photo, recovered items. */
export function TaskEvidenceCard({ task }: { task: EvidenceTask }) {
	const [photo, setPhoto] = useState<{ src: string; title: string } | null>(
		null,
	);
	const { labelOf: resolutionLabel } = useWorkerOptions("TASK_RESOLUTION");

	const hasEvidence =
		task.resolutionCode ||
		task.resolutionNote ||
		task.completionPhotoUrl ||
		(task.uninstalledItems && task.uninstalledItems.length > 0);

	if (!hasEvidence) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Completion Evidence</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{task.completedByEmployee && (
					<p className="text-sm text-muted-foreground">
						Completed by{" "}
						<span className="font-medium text-foreground">
							{task.completedByEmployee.name}
						</span>
						{task.completedAt &&
							` on ${formatDateTime(task.completedAt, { dateStyle: "medium", timeStyle: "short" })}`}
					</p>
				)}
				{task.resolutionCode && (
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground">
							Resolution:
						</span>
						<Badge variant="outline">
							{resolutionLabel(task.resolutionCode)}
						</Badge>
					</div>
				)}
				{task.resolutionNote && (
					<p className="rounded-md bg-muted/50 p-3 text-sm">
						{task.resolutionNote}
					</p>
				)}
				{task.completionPhotoUrl && (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							setPhoto({
								src: task.completionPhotoUrl as string,
								title: "Completion photo",
							})
						}
					>
						<ImageIcon className="mr-1.5 size-3.5" />
						View photo
					</Button>
				)}
				{task.uninstalledItems && task.uninstalledItems.length > 0 && (
					<div className="space-y-2">
						<p className="text-sm font-medium">
							Recovered equipment
						</p>
						{task.uninstalledItems.map((item) => (
							<div
								key={item.id}
								className="flex items-center justify-between gap-2 rounded-md border p-2.5"
							>
								<div className="flex items-center gap-2">
									<span className="text-sm">
										{item.itemName} ×{item.quantity}
									</span>
									<Badge
										variant={
											ITEM_STATUS_VARIANTS[item.status] ??
											"outline"
										}
									>
										{item.status.toLowerCase()}
									</Badge>
								</div>
								{item.pictureUrl && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() =>
											setPhoto({
												src: item.pictureUrl as string,
												title: item.itemName,
											})
										}
									>
										<ImageIcon className="size-3.5" />
									</Button>
								)}
							</div>
						))}
					</div>
				)}
			</CardContent>
			{photo && (
				<ImageViewerDialog
					open={!!photo}
					onOpenChange={(open) => {
						if (!open) {
							setPhoto(null);
						}
					}}
					src={photo.src}
					title={photo.title}
				/>
			)}
		</Card>
	);
}
