"use client";

import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
	UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { useDeletePlan, usePlans } from "../hooks/use-plans";
import { CreatePlanDialog } from "./CreatePlanDialog";
import { EditPlanDialog } from "./EditPlanDialog";

export function PlansList() {
	const { plans } = usePlans();
	const deletePlan = useDeletePlan();
	const [showCreate, setShowCreate] = useState(false);
	const [editingPlan, setEditingPlan] = useState<
		(typeof plans)[number] | null
	>(null);

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Service Plans</h1>
					<p className="text-muted-foreground">
						Manage internet packages for your customers
					</p>
				</div>
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create Plan
				</Button>
			</div>

			{plans.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
					<h3 className="mb-1 text-lg font-medium">No plans yet</h3>
					<p className="mb-4 text-sm text-muted-foreground">
						Create your first service plan to assign to customers.
					</p>
					<Button onClick={() => setShowCreate(true)}>
						<PlusIcon className="mr-2 size-4" />
						Create Plan
					</Button>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{plans.map((plan) => (
						<Card key={plan.id}>
							<CardHeader className="pb-3">
								<div className="flex items-start justify-between">
									<CardTitle className="text-base">
										{plan.name}
									</CardTitle>
									<Badge variant="secondary">
										${plan.monthlyPrice}/mo
									</Badge>
								</div>
								{plan.description && (
									<CardDescription className="line-clamp-2">
										{plan.description}
									</CardDescription>
								)}
							</CardHeader>
							<CardContent>
								<div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
									<span className="flex items-center gap-1">
										<ArrowDownIcon className="size-3" />
										{plan.downloadSpeed} Mbps
									</span>
									<span className="flex items-center gap-1">
										<ArrowUpIcon className="size-3" />
										{plan.uploadSpeed} Mbps
									</span>
									<span className="flex items-center gap-1">
										<UsersIcon className="size-3" />
										{plan._count.customers}
									</span>
								</div>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setEditingPlan(plan)}
									>
										<PencilIcon className="mr-1 size-3" />
										Edit
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											if (
												confirm(
													"Archive this plan? It won't be available for new customers.",
												)
											) {
												deletePlan.mutate({
													organizationId: plan.id, // will be overridden
													id: plan.id,
												});
											}
										}}
										disabled={plan._count.customers > 0}
									>
										<TrashIcon className="mr-1 size-3" />
										Archive
									</Button>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<CreatePlanDialog open={showCreate} onOpenChange={setShowCreate} />
			{editingPlan && (
				<EditPlanDialog
					plan={editingPlan}
					open={!!editingPlan}
					onOpenChange={(open) => {
						if (!open) {
							setEditingPlan(null);
						}
					}}
				/>
			)}
		</div>
	);
}
