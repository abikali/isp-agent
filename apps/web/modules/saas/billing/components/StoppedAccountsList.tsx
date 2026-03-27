"use client";

import { Pagination } from "@saas/shared/components/Pagination";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { displayName } from "@shared/lib/display-name";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Skeleton } from "@ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { OctagonXIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useReactivateAccount, useStoppedAccounts } from "../hooks/use-billing";

export function StoppedAccountsList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [page, setPage] = useState(1);
	const [reactivatePayment, setReactivatePayment] = useState<{
		id: string;
		customerName: string;
		currentExpiry: string | null;
	} | null>(null);

	const { payments, total, totalPages } = useStoppedAccounts({
		search: debouncedSearch || undefined,
		page,
	});

	return (
		<PageShell
			title="Stopped Accounts"
			description={`${total} stopped accounts`}
		>
			<div className="space-y-4">
				<SearchInput
					value={search}
					onChange={setSearch}
					placeholder="Search customers..."
				/>

				{payments.length === 0 ? (
					<EmptyState
						icon={OctagonXIcon}
						title="No stopped accounts"
						description="No stopped accounts found."
					/>
				) : (
					<div className="rounded-xl border bg-card">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Customer</TableHead>
									<TableHead>Plan</TableHead>
									<TableHead>Group</TableHead>
									<TableHead>Collector</TableHead>
									<TableHead>Stopped On</TableHead>
									<TableHead>Note</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{payments.map((payment) => (
									<TableRow key={payment.id}>
										<TableCell>
											<div className="font-medium">
												{displayName(
													payment.customer.firstName,
													payment.customer.lastName,
												)}
											</div>
											<div className="text-xs text-muted-foreground">
												{payment.customer.username}
											</div>
										</TableCell>
										<TableCell className="text-sm">
											{payment.customer.plan?.name ?? "—"}
										</TableCell>
										<TableCell className="text-sm">
											{payment.customer.groupName ?? "—"}
										</TableCell>
										<TableCell className="text-sm">
											{payment.collector.name}
										</TableCell>
										<TableCell className="text-sm">
											{new Date(
												payment.paidAt,
											).toLocaleDateString()}
										</TableCell>
										<TableCell className="max-w-28 truncate text-xs text-muted-foreground">
											{payment.noteCategory ??
												payment.notes ??
												"—"}
										</TableCell>
										<TableCell>
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													setReactivatePayment({
														id: payment.id,
														customerName:
															displayName(
																payment.customer
																	.firstName,
																payment.customer
																	.lastName,
															),
														currentExpiry: payment
															.customer.expiresAt
															? (new Date(
																	payment
																		.customer
																		.expiresAt,
																)
																	.toISOString()
																	.split(
																		"T",
																	)[0] ??
																null)
															: null,
													})
												}
											>
												<PlayIcon className="mr-1 size-3.5" />
												Reactivate
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}

				{totalPages > 1 && (
					<Pagination
						totalItems={total}
						itemsPerPage={25}
						currentPage={page}
						onChangeCurrentPage={setPage}
					/>
				)}
			</div>

			{reactivatePayment && (
				<ReactivateDialog
					open={!!reactivatePayment}
					onOpenChange={(open) => {
						if (!open) {
							setReactivatePayment(null);
						}
					}}
					paymentId={reactivatePayment.id}
					customerName={reactivatePayment.customerName}
					currentExpiry={reactivatePayment.currentExpiry}
				/>
			)}
		</PageShell>
	);
}

function ReactivateDialog({
	open,
	onOpenChange,
	paymentId,
	customerName,
	currentExpiry,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	paymentId: string;
	customerName: string;
	currentExpiry: string | null;
}) {
	const organizationId = useOrganizationId();
	const reactivate = useReactivateAccount();
	const [customExpiry, setCustomExpiry] = useState(currentExpiry ?? "");
	const [useCustom, setUseCustom] = useState(false);

	function handleReactivate() {
		if (!organizationId) {
			return;
		}

		reactivate.mutate(
			{
				organizationId,
				paymentId,
				customExpiry:
					useCustom && customExpiry
						? new Date(customExpiry).toISOString()
						: undefined,
			},
			{
				onSuccess: () => {
					toast.success("Account reactivated");
					onOpenChange(false);
				},
				onError: (error) => {
					toast.error(error.message);
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Reactivate Account</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Reactivate <strong>{customerName}</strong>?
					</p>

					<div className="flex gap-2">
						<Button
							variant={useCustom ? "outline" : "secondary"}
							size="sm"
							onClick={() => setUseCustom(false)}
						>
							Same Expiry
						</Button>
						<Button
							variant={useCustom ? "secondary" : "outline"}
							size="sm"
							onClick={() => setUseCustom(true)}
						>
							Custom Expiry
						</Button>
					</div>

					{useCustom && (
						<div>
							<Label htmlFor="customExpiry">
								New Expiry Date
							</Label>
							<Input
								id="customExpiry"
								type="date"
								value={customExpiry}
								onChange={(e) =>
									setCustomExpiry(e.target.value)
								}
							/>
						</div>
					)}

					<Button
						className="w-full"
						onClick={handleReactivate}
						disabled={reactivate.isPending}
					>
						{reactivate.isPending
							? "Reactivating..."
							: "Reactivate"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function StoppedAccountsListSkeleton() {
	return (
		<PageShell title="Stopped Accounts" description="Loading...">
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<div className="rounded-xl border bg-card p-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4 py-3">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-5 w-24" />
							<Skeleton className="ml-auto h-8 w-20" />
						</div>
					))}
				</div>
			</div>
		</PageShell>
	);
}
