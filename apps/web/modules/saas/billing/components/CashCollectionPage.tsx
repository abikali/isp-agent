"use client";

import {
	StatCard,
	StatCardGroup,
	StatCardSkeleton,
} from "@shared/components/StatCard";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { formatCurrency } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	BanknoteIcon,
	HandCoinsIcon,
	ReceiptTextIcon,
	SearchIcon,
	WalletIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	useCollections,
	useCollectorBalance,
	useCreateCollection,
	useCustomerGroups,
	useDeleteCollection,
	useMonthFilter,
} from "../hooks/use-billing";
import { BillingCycleSelect } from "./BillingCycleSelect";
import { GroupSelect } from "./BillingFilters";
import { HandoffCard } from "./HandoffCard";
import { HandoffsTable } from "./HandoffsTable";
import { PaymentsTable } from "./PaymentsTable";

const HANDOFF_SORT_BY_MAP = {
	collectedAt: "collectedAt",
	amount: "amount",
	type: "type",
} as const satisfies Record<string, "collectedAt" | "amount" | "type">;

/** Non-suspense payments query for use inside this page */
function useCollectorPayments(filters: {
	collectorId: string | null;
	billingMonthId?: string;
	stoppedAccount?: boolean;
	groupName?: string;
	search?: string;
	page?: number;
	pageSize?: number;
}) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId && filters.collectorId
			? orpc.billing.payments.list.queryOptions({
					input: {
						organizationId,
						collectorId: filters.collectorId,
						billingMonthId: filters.billingMonthId,
						stoppedAccount: filters.stoppedAccount,
						groupName: filters.groupName,
						search: filters.search || undefined,
						page: filters.page ?? 1,
						pageSize: filters.pageSize ?? 25,
						sortBy: "paidAt",
						sortOrder: "desc",
					},
				})
			: disabledQuery([
					"billing",
					"payments",
					"list",
					"collector",
					String(filters.stoppedAccount ?? "all"),
				]),
	);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive cash-collection feature page; sections share collector/page/filter state and splitting would scatter tightly-coupled billing logic
export function CashCollectionPage({
	collectorId,
	collectorName,
}: {
	collectorId: string;
	collectorName: string;
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- these are independent UI slices (page, tab, status/group filters, search); a reducer would not group them meaningfully
}) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);
	const [tab, setTab] = useState<"payments" | "handoffs">("payments");

	const {
		sorting: handoffSorting,
		sortBy: handoffSortBy,
		sortOrder: handoffSortOrder,
		onSortingChange: onHandoffSortingChange,
	} = useServerSorting(HANDOFF_SORT_BY_MAP, () => setPage(1));
	const [statusFilter, setStatusFilter] = useState<string>("");
	const [groupFilter, setGroupFilter] = useState<string>("");
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(timer);
	}, [search]);

	const { groups } = useCustomerGroups();
	const {
		monthFilter,
		setMonthFilter,
		activeMonthId,
		options: monthOptions,
	} = useMonthFilter();

	const { data: balanceData, isLoading: balanceLoading } =
		useCollectorBalance(collectorId);

	const { data: collectionsData } = useCollections({
		collectorId,
		page: tab === "handoffs" ? page : 1,
		sortBy: handoffSortBy,
		sortOrder: handoffSortOrder,
	});

	const stoppedAccount =
		statusFilter === "stopped"
			? true
			: statusFilter === "collected"
				? false
				: undefined;

	const {
		data: paymentsData,
		isLoading: paymentsLoading,
		isFetching: paymentsFetching,
	} = useCollectorPayments({
		collectorId,
		billingMonthId: activeMonthId,
		stoppedAccount,
		groupName: groupFilter || undefined,
		search: debouncedSearch || undefined,
		page,
		pageSize: 25,
	});

	const createCollection = useCreateCollection();
	const deleteCollection = useDeleteCollection();

	const balance = balanceData?.balance ?? 0;

	const form = useForm({
		defaultValues: {
			amount: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			toast.promise(
				createCollection.mutateAsync({
					organizationId,
					collectorId,
					amount: Number(value.amount),
					notes: value.notes || undefined,
				}),
				{
					loading: "Recording collection...",
					success: () => {
						form.reset();
						return "Collection recorded";
					},
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to record collection",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	function handleCollectAll() {
		if (balance > 0) {
			form.setFieldValue("amount", String(balance));
		}
	}

	function handleDelete(collectionId: string) {
		if (!organizationId) {
			return;
		}
		toast.promise(
			deleteCollection.mutateAsync({ organizationId, collectionId }),
			{
				loading: "Deleting...",
				success: "Collection record deleted",
				error: (err: { message?: string }) =>
					err?.message ?? "Failed to delete",
			},
		);
	}

	const payments = paymentsData?.payments ?? [];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h2 className="text-2xl font-bold tracking-tight">
					{collectorName}
				</h2>
				<p className="text-sm text-muted-foreground">
					Cash collection and handoff tracking
				</p>
			</div>

			{/* Balance + Stats Cards */}
			{balanceLoading ? (
				<StatCardGroup columns={4}>
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
				</StatCardGroup>
			) : (
				(() => {
					const monthBillCount = balanceData?.monthBillCount ?? 0;
					const monthPaidCount = balanceData?.monthPaidCount ?? 0;
					const monthAmountCollected =
						balanceData?.monthAmountCollected ?? 0;
					const monthAmountDue = balanceData?.monthAmountDue ?? 0;
					const unpaidCount = Math.max(
						0,
						monthBillCount - monthPaidCount,
					);
					const remaining = Math.max(
						0,
						monthAmountDue - monthAmountCollected,
					);
					const settledPct =
						monthBillCount > 0
							? Math.round(
									(monthPaidCount / monthBillCount) * 100,
								)
							: 0;
					const billsHelper =
						monthBillCount === 0
							? "No bills this cycle"
							: unpaidCount === 0
								? "All collected this cycle"
								: `${settledPct}% settled • ${unpaidCount} to go`;
					const remainingHelper =
						monthBillCount === 0
							? "Nothing billed yet"
							: unpaidCount === 0
								? "All bills collected"
								: `${unpaidCount} bills still to collect`;
					return (
						<StatCardGroup columns={4}>
							<StatCard
								title="In Hand"
								value={formatCurrency(balance)}
								icon={WalletIcon}
								color="amber"
								description="Cash on you to hand off"
							/>
							<StatCard
								title="Bills"
								value={`${monthPaidCount}/${monthBillCount}`}
								icon={ReceiptTextIcon}
								color="blue"
								description={billsHelper}
							/>
							<StatCard
								title="Collected"
								value={formatCurrency(monthAmountCollected)}
								icon={BanknoteIcon}
								color="emerald"
								description="This cycle"
							/>
							<StatCard
								title="Remaining"
								value={formatCurrency(remaining)}
								icon={HandCoinsIcon}
								color="red"
								description={remainingHelper}
							/>
						</StatCardGroup>
					);
				})()
			)}

			{/* Handoff form */}
			<HandoffCard
				balance={balance}
				handoffForm={form}
				isSubmittingHandoff={isSubmitting}
				onCollectAll={handleCollectAll}
			/>

			{/* Tabs: Recent Payments / Handoff History */}
			<div className="space-y-3">
				<div className="flex gap-1 border-b">
					<button
						type="button"
						onClick={() => {
							setTab("payments");
							setPage(1);
						}}
						className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							tab === "payments"
								? "border-primary text-primary"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<ReceiptTextIcon className="mr-1.5 inline size-3.5" />
						Payments
						{paymentsData?.total != null
							? ` (${paymentsData.total})`
							: ""}
					</button>
					<button
						type="button"
						onClick={() => {
							setTab("handoffs");
							setPage(1);
						}}
						className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							tab === "handoffs"
								? "border-primary text-primary"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<HandCoinsIcon className="mr-1.5 inline size-3.5" />
						Handoff History
						{collectionsData?.total
							? ` (${collectionsData.total})`
							: ""}
					</button>
				</div>

				{tab === "payments" ? (
					<>
						{/* Payment Filters */}
						<div className="flex flex-wrap gap-2">
							<div className="relative min-w-0 flex-1 sm:flex-none">
								<SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
								<Input
									placeholder="Search customer..."
									value={search}
									onChange={(e) => {
										setSearch(e.target.value);
										setPage(1);
									}}
									className="w-full sm:w-48 pl-8"
								/>
							</div>
							<Select
								value={statusFilter || "all"}
								onValueChange={(val) => {
									setStatusFilter(val === "all" ? "" : val);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-full sm:w-36">
									<SelectValue placeholder="Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All statuses
									</SelectItem>
									<SelectItem value="collected">
										Collected
									</SelectItem>
									<SelectItem value="stopped">
										Stopped
									</SelectItem>
								</SelectContent>
							</Select>
							<GroupSelect
								value={groupFilter}
								onChange={(val) => {
									setGroupFilter(val);
									setPage(1);
								}}
								groups={groups}
								className="w-full sm:w-40"
							/>
							<BillingCycleSelect
								value={monthFilter || activeMonthId || ""}
								onValueChange={(val) => {
									setMonthFilter(val);
									setPage(1);
								}}
								options={monthOptions}
								allLabel="All Months"
							/>
						</div>

						<PaymentsTable
							payments={payments}
							total={paymentsData?.total ?? 0}
							page={page}
							onPageChange={setPage}
							isLoading={paymentsLoading}
							isFetching={paymentsFetching}
							collectorName={collectorName}
						/>
					</>
				) : (
					<HandoffsTable
						collections={collectionsData?.collections ?? []}
						total={collectionsData?.total ?? 0}
						page={page}
						onPageChange={setPage}
						onDelete={handleDelete}
						sorting={handoffSorting}
						onSortingChange={onHandoffSortingChange}
					/>
				)}
			</div>
		</div>
	);
}
