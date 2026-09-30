"use client";

import { useCustomerNotifications } from "@saas/billing/hooks/use-customer-notifications";
import { displayName } from "@shared/lib/display-name";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { format } from "date-fns";
import { useState } from "react";

const STATUS_VARIANT = {
	sent: "success",
	failed: "error",
	skipped: "secondary",
	queued: "info",
} as const;

const STATUS_FILTERS = ["all", "sent", "failed", "skipped"] as const;

/** Delivery log of payment reminders and stop notices, newest first. */
export function CustomerNotificationsLog() {
	const [status, setStatus] =
		useState<(typeof STATUS_FILTERS)[number]>("all");
	const [page, setPage] = useState(1);
	const { data, isLoading } = useCustomerNotifications({
		status: status === "all" ? undefined : status,
		page,
	});
	const rows = data?.notifications ?? [];

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-1">
				{STATUS_FILTERS.map((s) => (
					<Button
						key={s}
						size="sm"
						variant={status === s ? "secondary" : "ghost"}
						onClick={() => {
							setStatus(s);
							setPage(1);
						}}
					>
						{s[0]?.toUpperCase()}
						{s.slice(1)}
					</Button>
				))}
			</div>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Date</TableHead>
							<TableHead>Customer</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Channel</TableHead>
							<TableHead>Phone</TableHead>
							<TableHead>Contact</TableHead>
							<TableHead>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={7}
									className="text-center text-muted-foreground"
								>
									{isLoading
										? "Loading…"
										: "Nothing sent yet."}
								</TableCell>
							</TableRow>
						) : (
							rows.map((n) => (
								<TableRow key={n.id}>
									<TableCell className="whitespace-nowrap">
										{format(
											new Date(n.createdAt),
											"d MMM HH:mm",
										)}
									</TableCell>
									<TableCell>
										{displayName(
											n.customer.firstName,
											n.customer.lastName,
										) || n.customer.username}
									</TableCell>
									<TableCell>
										{n.kind === "stop_notice"
											? "Stop notice"
											: "Expiry reminder"}
									</TableCell>
									<TableCell>
										{n.channel === "sms"
											? "SMS"
											: "WhatsApp"}
									</TableCell>
									<TableCell className="font-mono text-xs">
										{n.phone}
									</TableCell>
									<TableCell className="font-mono text-xs">
										{n.contactPhone ?? "—"}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												STATUS_VARIANT[
													n.status as keyof typeof STATUS_VARIANT
												] ?? "secondary"
											}
										>
											{n.status}
										</Badge>
										{n.error && (
											<p className="mt-1 max-w-56 text-muted-foreground text-xs">
												{n.error}
											</p>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
			{data && data.totalPages > 1 && (
				<div className="flex items-center justify-end gap-2 text-sm">
					<Button
						size="sm"
						variant="outline"
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
					>
						Previous
					</Button>
					<span className="text-muted-foreground">
						{page} / {data.totalPages}
					</span>
					<Button
						size="sm"
						variant="outline"
						disabled={page >= data.totalPages}
						onClick={() => setPage((p) => p + 1)}
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
}
