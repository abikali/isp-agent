"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { cn } from "@ui/lib";
import { ArrowLeftRightIcon, ArrowRightIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import {
	useCollectors,
	useTransferCash,
	useWorkersQuery,
} from "../hooks/use-billing";

// ─── Move cash card ──────────────────────────────────────────────────
//
// Shared by the collector and worker detail pages. Moves cash from one staff
// member to another in one step (e.g. a collector's round → the company
// cashier). See `billing.collections.transfer` for the ledger rules.

type Direction = "out" | "in";

interface Person {
	id: string;
	name: string;
	username: string | null;
	inHand: number;
}

export function MoveCashCard({
	employeeId,
	employeeName,
	balance,
}: {
	employeeId: string;
	employeeName: string;
	balance: number;
}) {
	const organizationId = useOrganizationId();
	const transferCash = useTransferCash();
	const people = useStaffWithCash(employeeId);

	const form = useForm({
		defaultValues: {
			direction: "out" as Direction,
			otherId: "",
			amount: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId || !value.otherId) {
				return;
			}
			const outbound = value.direction === "out";
			toast.promise(
				transferCash.mutateAsync({
					organizationId,
					fromEmployeeId: outbound ? employeeId : value.otherId,
					toEmployeeId: outbound ? value.otherId : employeeId,
					amount: Number(value.amount),
					notes: value.notes || undefined,
				}),
				{
					loading: "Moving cash…",
					success: () => {
						form.reset();
						return "Cash moved";
					},
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to move cash",
				},
			);
		},
	});

	// The mutation outlives the form submit (toast.promise isn't awaited), so
	// the button follows the request itself — no double moves.
	const isSubmitting =
		useStore(form.store, (s) => s.isSubmitting) || transferCash.isPending;
	const direction = useStore(form.store, (s) => s.values.direction);
	const otherId = useStore(form.store, (s) => s.values.otherId);
	const amount = Number(useStore(form.store, (s) => s.values.amount)) || 0;

	const self: Person = {
		id: employeeId,
		name: employeeName,
		username: null,
		inHand: balance,
	};
	const other = people.find((p) => p.id === otherId) ?? null;
	const from = direction === "out" ? self : other;
	const to = direction === "out" ? other : self;
	const senderInHand = from?.inHand ?? 0;

	const options = useMemo(
		() =>
			people.map((p) => ({
				value: p.id,
				label: `${p.name}${p.username ? ` · @${p.username}` : ""} · ${formatCurrency(p.inHand)}`,
			})),
		[people],
	);

	const picker = (
		<form.Field name="otherId">
			{(field) => (
				<Combobox
					options={options}
					value={field.state.value}
					onChange={field.handleChange}
					placeholder="Pick a person…"
					searchPlaceholder="Search staff…"
					emptyText="No staff found"
					className="h-9"
				/>
			)}
		</form.Field>
	);
	const selfChip = (
		<div className="flex h-9 items-center truncate rounded-md border border-border bg-surface-subtle/40 px-3 text-sm font-medium">
			{employeeName}
		</div>
	);

	return (
		<ContentCard>
			<ContentCardSection className="space-y-3">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<ArrowLeftRightIcon className="size-4 text-muted-foreground" />
					Move cash
				</div>
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Form via oRPC mutation; preventDefault is the documented pattern */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="grid gap-4 sm:grid-cols-2"
				>
					<div className="space-y-2.5">
						<div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
							<div className="min-w-0 space-y-1">
								<div className="text-xs text-muted-foreground">
									From
								</div>
								{direction === "out" ? selfChip : picker}
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-9"
								aria-label="Swap direction"
								onClick={() =>
									form.setFieldValue(
										"direction",
										direction === "out" ? "in" : "out",
									)
								}
							>
								<ArrowLeftRightIcon className="size-4" />
							</Button>
							<div className="min-w-0 space-y-1">
								<div className="text-xs text-muted-foreground">
									To
								</div>
								{direction === "out" ? picker : selfChip}
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<form.Field name="amount">
								{(field) => (
									<div className="flex items-center gap-2">
										<Input
											type="number"
											step="0.01"
											min="0.01"
											placeholder="0.00"
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
											className="h-9 w-28 tabular-nums"
											required
										/>
										{from && senderInHand > 0 && (
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="h-9 shrink-0 text-xs"
												onClick={() =>
													field.handleChange(
														String(senderInHand),
													)
												}
											>
												All ·{" "}
												{formatCurrency(senderInHand)}
											</Button>
										)}
									</div>
								)}
							</form.Field>
							<form.Field name="notes">
								{(field) => (
									<Input
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Note (optional)"
										className="h-9 min-w-[140px] flex-1"
									/>
								)}
							</form.Field>
						</div>
						<Button
							type="submit"
							variant="secondary"
							className="w-full"
							disabled={isSubmitting || !otherId || amount <= 0}
						>
							<ArrowLeftRightIcon className="mr-1.5 size-4" />
							{isSubmitting ? "Moving…" : "Move cash"}
						</Button>
					</div>

					<MoveCashPreview from={from} to={to} amount={amount} />
				</form>
			</ContentCardSection>
		</ContentCard>
	);
}

/**
 * Everyone cash can move to: collectors and workers merged into one list,
 * with the cash each holds. Someone in both lists keeps the balance his page
 * shows — the collector formula for collectors (and collector & worker),
 * the worker formula for workers (same rule as the Money page's "cash held").
 */
function useStaffWithCash(excludeId: string): Person[] {
	const { data: collectorsData } = useCollectors();
	const { data: workersData } = useWorkersQuery();

	return useMemo(() => {
		const byId = new Map<string, Person>();
		for (const w of workersData?.workers ?? []) {
			byId.set(w.id, w);
		}
		for (const c of collectorsData?.collectors ?? []) {
			if (!byId.has(c.id) || c.cashRole !== "WORKER") {
				byId.set(c.id, c);
			}
		}
		byId.delete(excludeId);
		return [...byId.values()]
			.map(({ id, name, username, inHand }) => ({
				id,
				name,
				username,
				inHand,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [collectorsData, workersData, excludeId]);
}

function MoveCashPreview({
	from,
	to,
	amount,
}: {
	from: Person | null;
	to: Person | null;
	amount: number;
}) {
	const ready = from !== null && to !== null && amount > 0;

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface-subtle/40 p-3">
			<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				What happens
			</div>
			{ready ? (
				<>
					<BalanceLine person={from} delta={-amount} />
					<BalanceLine person={to} delta={amount} />
					<p className="text-[11px] text-muted-foreground">
						Company cash unchanged — nothing reaches the office and
						it is not an expense.
					</p>
					{amount > from.inHand + 0.005 && (
						<p className="text-xs text-warning">
							That is more than {from.name} holds (
							{formatCurrency(from.inHand)}). He will show a
							negative cash in hand.
						</p>
					)}
				</>
			) : (
				<p className="mt-auto text-[11px] text-muted-foreground/70">
					Pick a person and enter an amount to preview the move.
				</p>
			)}
		</div>
	);
}

function BalanceLine({ person, delta }: { person: Person; delta: number }) {
	return (
		<div className="space-y-1">
			<div className="truncate text-xs text-muted-foreground">
				{person.name}
			</div>
			<div className="flex items-center gap-2 text-sm font-medium tabular-nums">
				<span className="text-muted-foreground">
					{formatCurrency(person.inHand)}
				</span>
				<ArrowRightIcon className="size-3 text-muted-foreground/50" />
				<span
					className={cn(
						person.inHand + delta < 0
							? "text-warning"
							: "text-foreground",
					)}
				>
					{formatCurrency(person.inHand + delta)}
				</span>
				<span className="text-[11px] font-normal text-muted-foreground">
					{delta > 0 ? "+" : "−"}
					{formatCurrency(Math.abs(delta))}
				</span>
			</div>
		</div>
	);
}
