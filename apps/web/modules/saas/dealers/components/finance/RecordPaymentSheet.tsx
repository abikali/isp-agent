"use client";

import { useConfirmationAlert } from "@saas/shared/client";
import {
	beirutWallClockToUtc,
	formatCurrency,
	formatDateTimeLocalInput,
} from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import { useState } from "react";
import { toast } from "sonner";
import { useRecordDealerPayment } from "../../hooks/use-dealer-finance";
import {
	LEDGER_KINDS,
	PAYMENT_KIND_OPTIONS,
	type PaymentKind,
} from "../../lib/finance-labels";

export interface PaymentTarget {
	id: string;
	name: string;
	owed: number;
	isDeleted?: boolean;
}

export interface PaymentStaff {
	id: string;
	name: string;
	department: string | null;
}

interface RecordPaymentSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Preselected dealer; null lets the user pick from `dealers`. */
	dealer: PaymentTarget | null;
	dealers?: PaymentTarget[];
	initialKind?: PaymentKind;
	/** Employees who may have taken the cash; empty hides the choice. */
	staff?: PaymentStaff[];
}

function parseAmount(value: string): number {
	const n = Number.parseFloat(value.replace(/,/g, ""));
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Money coming back from a dealer. The sheet shows the consequence before the
 * button is pressed ("after this they will owe …") and asks once more on the
 * way out, because an iRadius ledger row cannot be deleted afterwards.
 *
 * Mount with `key={dealer?.id}` so switching dealers resets the form.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- one form, one submit path; the preview and the confirm need the same state
export function RecordPaymentSheet({
	open,
	onOpenChange,
	dealer,
	dealers = [],
	staff = [],
	initialKind = "payment",
}: RecordPaymentSheetProps) {
	const organizationId = useOrganizationId();
	const record = useRecordDealerPayment();
	const { confirm } = useConfirmationAlert();

	const [dealerId, setDealerId] = useState(dealer?.id ?? "");
	const [kind, setKind] = useState<PaymentKind>(initialKind);
	const [amount, setAmount] = useState(() =>
		dealer && dealer.owed > 0 ? String(dealer.owed) : "",
	);
	const [date, setDate] = useState(() => formatDateTimeLocalInput());
	const [note, setNote] = useState("");
	/** "" = the office took the money. */
	const [receivedById, setReceivedById] = useState("");

	const target = dealer ?? dealers.find((d) => d.id === dealerId) ?? null;
	const owed = target?.owed ?? 0;
	const parsed = parseAmount(amount);
	const after = Math.round((owed - parsed) * 100) / 100;
	const overpaying = parsed > 0 && parsed > owed;
	const nothingOwed = owed <= 0;
	const kindMeta = LEDGER_KINDS[kind];
	const receiver =
		kind === "payment" && receivedById
			? (staff.find((s) => s.id === receivedById) ?? null)
			: null;
	// A dealer gone from iRadius can only be written off.
	const kindOptions = target?.isDeleted
		? PAYMENT_KIND_OPTIONS.filter((o) => o.value === "write_off")
		: PAYMENT_KIND_OPTIONS;

	const dateValue = beirutWallClockToUtc(date);
	const dateInvalid = Number.isNaN(dateValue.getTime());
	const dateInFuture =
		!dateInvalid && dateValue.getTime() > Date.now() + 60_000;

	const canSubmit =
		!!organizationId &&
		!!target &&
		parsed > 0 &&
		!dateInvalid &&
		!dateInFuture &&
		!record.isPending;

	function submit() {
		if (!organizationId || !target || record.isPending) {
			return;
		}
		const verb =
			kind === "payment"
				? "received"
				: kind === "write_off"
					? "written off for"
					: kind === "in_kind"
						? "accepted in kind from"
						: "adjusted for";
		confirm({
			title: `Record ${formatCurrency(parsed)} ${verb} ${target.name}?`,
			message:
				after === 0
					? "This settles their account completely. It is written to iRadius and cannot be deleted afterwards."
					: after > 0
						? `They will still owe ${formatCurrency(after)}. This is written to iRadius and cannot be deleted afterwards.`
						: `This is ${formatCurrency(-after)} more than they owe — they will be in credit with you by that amount. It is written to iRadius and cannot be deleted afterwards.`,
			confirmLabel: "Record it",
			...(receiver
				? {
						message: `${receiver.name} is holding this cash until they hand it in. ${
							after === 0
								? "This settles the dealer's account completely."
								: after > 0
									? `The dealer will still owe ${formatCurrency(after)}.`
									: `That is ${formatCurrency(-after)} more than they owe.`
						} Written to iRadius; cannot be deleted afterwards.`,
					}
				: {}),
			destructive: kind === "write_off",
			onConfirm: async () => {
				try {
					const result = await record.mutateAsync({
						organizationId,
						dealerId: target.id,
						kind,
						amount: parsed,
						date: dateValue,
						...(note.trim() ? { note: note.trim() } : {}),
						...(receiver
							? { receivedByEmployeeId: receiver.id }
							: {}),
					});
					toast.success(
						result.owed === 0
							? `${target.name} is settled.`
							: `Recorded. ${target.name} now owes ${formatCurrency(result.owed)}.`,
					);
					onOpenChange(false);
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Could not record the payment",
					);
				}
			},
		});
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
				<SheetHeader className="border-b border-border pb-4">
					<SheetTitle>Record money from a dealer</SheetTitle>
					<SheetDescription>
						Lowers what they owe you. Their prepaid credit is not
						touched.
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 space-y-5 py-5">
					{!dealer && (
						<div className="space-y-1.5">
							<Label htmlFor="payment-dealer">Dealer</Label>
							<Select
								value={dealerId}
								onValueChange={setDealerId}
							>
								<SelectTrigger id="payment-dealer">
									<SelectValue placeholder="Choose a dealer" />
								</SelectTrigger>
								<SelectContent>
									{[...dealers]
										.sort((a, b) => b.owed - a.owed)
										.map((d) => (
											<SelectItem key={d.id} value={d.id}>
												{d.name}
												{d.owed > 0
													? ` — owes ${formatCurrency(d.owed)}`
													: " — settled"}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
					)}

					{target && (
						<div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
							<span className="text-muted-foreground">
								{target.name} currently owes{" "}
							</span>
							<span className="font-medium tabular-nums">
								{formatCurrency(owed)}
							</span>
						</div>
					)}

					<div className="space-y-1.5">
						<Label>What happened?</Label>
						<div className="grid grid-cols-2 gap-2">
							{kindOptions.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => setKind(option.value)}
									aria-pressed={kind === option.value}
									className={cn(
										"rounded-lg border px-3 py-2 text-left transition-colors",
										kind === option.value
											? "border-foreground/50 bg-background ring-1 ring-foreground/10"
											: "border-border hover:border-foreground/20",
									)}
								>
									<div className="text-sm font-medium">
										{option.label}
									</div>
									<div className="text-xs text-muted-foreground">
										{option.hint}
									</div>
								</button>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							{kindMeta.meaning}
						</p>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="payment-amount">Amount</Label>
						<div className="flex gap-2">
							<Input
								id="payment-amount"
								inputMode="decimal"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								placeholder="0.00"
								className="font-mono tabular-nums"
								autoFocus={!!dealer}
							/>
							{owed > 0 && parsed !== owed && (
								<Button
									type="button"
									variant="outline"
									onClick={() => setAmount(String(owed))}
								>
									All of it
								</Button>
							)}
						</div>
						{nothingOwed && parsed > 0 && (
							<p className="text-xs text-info">
								They do not owe anything right now — this will
								put them in credit with you.
							</p>
						)}
						{overpaying && !nothingOwed && (
							<p className="text-xs text-warning">
								More than they owe. Fine for an advance, but
								double-check the number.
							</p>
						)}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="payment-date">When</Label>
						<Input
							id="payment-date"
							type="datetime-local"
							value={date}
							max={formatDateTimeLocalInput()}
							onChange={(e) => setDate(e.target.value)}
						/>
						{dateInFuture && (
							<p className="text-xs text-destructive">
								The date cannot be in the future.
							</p>
						)}
					</div>

					{kind === "payment" && staff.length > 0 && (
						<div className="space-y-1.5">
							<Label htmlFor="payment-received-by">
								Who took the cash?
							</Label>
							<Select
								value={receivedById || "office"}
								onValueChange={(v) =>
									setReceivedById(v === "office" ? "" : v)
								}
							>
								<SelectTrigger id="payment-received-by">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="office">
										The office
									</SelectItem>
									{staff.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
											{s.department === "BILLING"
												? " — collector"
												: s.department
													? " — worker"
													: ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								{receiver
									? `${receiver.name} holds this cash until they hand it in. It shows up in their balance right away.`
									: "Pick an employee if a worker or collector took the money instead of the office."}
							</p>
						</div>
					)}

					<div className="space-y-1.5">
						<Label htmlFor="payment-note">
							Note{" "}
							<span className="font-normal text-muted-foreground">
								(shows in iRadius too)
							</span>
						</Label>
						<Textarea
							id="payment-note"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={2}
							maxLength={200}
							placeholder={
								kind === "in_kind"
									? "e.g. 2 routers, ftth"
									: kind === "write_off"
										? "Why it is forgiven"
										: "Optional"
							}
						/>
					</div>

					{target && parsed > 0 && (
						<div
							className={cn(
								"rounded-lg border px-3 py-2.5 text-sm",
								after <= 0
									? "border-success/30 bg-success/[0.06]"
									: "border-border bg-muted/40",
							)}
						>
							After this,{" "}
							<span className="font-medium">{target.name}</span>{" "}
							{after === 0 ? (
								<span className="font-medium text-success">
									will be fully settled.
								</span>
							) : after > 0 ? (
								<>
									will owe{" "}
									<span className="font-medium tabular-nums">
										{formatCurrency(after)}
									</span>
									.
								</>
							) : (
								<>
									will be{" "}
									<span className="font-medium tabular-nums">
										{formatCurrency(-after)}
									</span>{" "}
									in credit with you.
								</>
							)}
							{receiver && (
								<span className="mt-1 block text-muted-foreground">
									{receiver.name} will be holding{" "}
									<span className="font-medium tabular-nums">
										{formatCurrency(parsed)}
									</span>{" "}
									for you.
								</span>
							)}
						</div>
					)}
				</div>

				<div className="flex gap-2 border-t border-border pt-4">
					<Button
						variant="outline"
						className="flex-1"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						className="flex-1"
						disabled={!canSubmit}
						onClick={submit}
					>
						{record.isPending ? "Recording…" : "Record"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
