"use client";
import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { Card } from "@ui/components/card";
import { PercentIcon, TrendingUpIcon, UserPlusIcon } from "lucide-react";

export function OrganizationStart() {
	return (
		<div className="@container">
			<StatCardGroup columns={3}>
				<StatCard
					title="New clients"
					value={344}
					icon={UserPlusIcon}
					color="blue"
				/>
				<StatCard
					title="Revenue"
					value="$5,243"
					icon={TrendingUpIcon}
					color="emerald"
				/>
				<StatCard
					title="Churn"
					value="3%"
					icon={PercentIcon}
					color="red"
				/>
			</StatCardGroup>

			<Card className="mt-6">
				<div className="flex h-64 items-center justify-center p-8 text-foreground/60">
					Place your content here...
				</div>
			</Card>
		</div>
	);
}
