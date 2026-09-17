"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Combobox } from "@ui/components/combobox";
import { Field, FieldLabel } from "@ui/components/field";
import { NetworkIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

interface DealerOption {
	id: string;
	name: string;
}

export function InternalDealerLinesCard({
	organizationId,
	activeDealerId,
	lines,
	dealers,
}: {
	organizationId: string;
	activeDealerId: string | null;
	lines: Array<DealerOption & { externalId: string | null }>;
	dealers: DealerOption[];
}) {
	const queryClient = useQueryClient();

	const setInternalLineMutation = useMutation({
		...orpc.admin.dealers.setInternalLine.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.organizations.key(),
			});
			toast.success("Internal lines updated");
		},
		onError: (err) => {
			toast.error(err?.message || "Failed to update internal lines");
		},
	});

	const linkedIds = new Set(lines.map((line) => line.id));
	const candidates = dealers.filter(
		(d) => d.id !== activeDealerId && !linkedIds.has(d.id),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<NetworkIcon className="size-4" />
					Internal Lines
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{lines.length > 0 ? (
					<ul className="space-y-2">
						{lines.map((line) => (
							<li
								key={line.id}
								className="flex items-center justify-between rounded-md border px-3 py-2"
							>
								<div className="flex flex-col">
									<span className="text-sm font-medium">
										{line.name}
									</span>
									{line.externalId && (
										<span className="text-muted-foreground text-xs">
											iRadius #{line.externalId}
										</span>
									)}
								</div>
								<Button
									variant="ghost"
									size="icon"
									aria-label={`Unlink ${line.name}`}
									disabled={setInternalLineMutation.isPending}
									onClick={() =>
										setInternalLineMutation.mutate({
											dealerId: line.id,
											organizationId: null,
										})
									}
								>
									<XIcon className="size-4" />
								</Button>
							</li>
						))}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">
						No internal lines
					</p>
				)}

				{activeDealerId && (
					<Field>
						<FieldLabel>Link a dealer as a line</FieldLabel>
						<Combobox
							options={candidates.map((d) => ({
								value: d.id,
								label: d.name,
							}))}
							value=""
							onChange={(dealerId) =>
								setInternalLineMutation.mutate({
									dealerId,
									organizationId,
								})
							}
							disabled={setInternalLineMutation.isPending}
							placeholder="Select a dealer..."
							searchPlaceholder="Search dealers…"
							emptyText="No dealers found"
						/>
					</Field>
				)}

				<div className="text-xs text-muted-foreground space-y-1">
					<p>
						An internal line is a second iRadius dealer account this
						organization runs itself (e.g. a fiber/DSL line), not a
						reseller.
					</p>
					<p>
						The iRadius sync imports its subscribers, staff and
						plans as this organization's own, under the assigned
						dealer. Run a full sync after linking.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
