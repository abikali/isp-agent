"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import {
	AgingBucketsChart,
	CustomersChart,
	RevenueChart,
} from "@shared/components/charts";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";

export function TrendsRow() {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		return null;
	}
	return <TrendsRowInner organizationId={organizationId} />;
}

function TrendsRowInner({ organizationId }: { organizationId: string }) {
	const navigate = useNavigate();
	const { organizationSlug } = useParams({ strict: false }) as {
		organizationSlug?: string;
	};

	const { data } = useSuspenseQuery(
		orpc.dashboard.trends.queryOptions({
			input: { organizationId, windowDays: 30 },
		}),
	);

	const revenueData = data.revenuePoints.map((p) => ({
		date: p.day,
		current: p.amount,
	}));

	const customersData = data.customersPoints.map((p) => ({
		date: p.day,
		added: p.count,
		cumulative: p.cumulative,
	}));

	return (
		<section className="grid gap-3 lg:grid-cols-3">
			<ContentCard className="lg:col-span-2">
				<ContentCardSection className="border-b border-border">
					<div className="text-sm font-medium">Revenue</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Collected per day, last 30 days
					</p>
				</ContentCardSection>
				<ContentCardSection>
					<RevenueChart data={revenueData} showPrevious={false} />
				</ContentCardSection>
			</ContentCard>

			<ContentCard>
				<ContentCardSection className="border-b border-border">
					<div className="text-sm font-medium">New customers</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Last 30 days
					</p>
				</ContentCardSection>
				<ContentCardSection>
					<CustomersChart data={customersData} />
				</ContentCardSection>
			</ContentCard>

			<ContentCard className="lg:col-span-3">
				<ContentCardSection className="border-b border-border">
					<div className="text-sm font-medium">Aging buckets</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Outstanding by days overdue · click a bar to drill in
					</p>
				</ContentCardSection>
				<ContentCardSection>
					<AgingBucketsChart
						data={data.aging}
						onBucketClick={() => {
							if (organizationSlug) {
								navigate({
									to: "/app/$organizationSlug/billing/collect",
									params: { organizationSlug },
								});
							}
						}}
					/>
				</ContentCardSection>
			</ContentCard>
		</section>
	);
}
