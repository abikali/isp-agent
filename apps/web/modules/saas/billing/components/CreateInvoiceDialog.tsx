"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCreateInvoice, useCurrentMonth } from "../hooks/use-billing";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateInvoiceDialog({ open, onOpenChange }: Props) {
	const organizationId = useOrganizationId();
	const { data: currentMonthData } = useCurrentMonth();
	const activeMonth = currentMonthData?.month;

	const [search, setSearch] = useState("");
	const [customerId, setCustomerId] = useState<string | null>(null);
	const [year, setYear] = useState<number>(0);
	const [month, setMonth] = useState<number>(0);
	const [total, setTotal] = useState("");
	const [discount, setDiscount] = useState("0");
	const [tax, setTax] = useState("0");

	useEffect(() => {
		if (open && activeMonth) {
			setYear(activeMonth.year);
			setMonth(activeMonth.month);
		}
		if (!open) {
			setSearch("");
			setCustomerId(null);
			setTotal("");
			setDiscount("0");
			setTax("0");
		}
	}, [open, activeMonth]);

	const { data: customerResults } = useQuery(
		organizationId && search.length >= 2
			? orpc.customers.list.queryOptions({
					input: {
						organizationId,
						search,
						page: 1,
						pageSize: 10,
					},
				})
			: { queryKey: ["customers", "list", "disabled"], enabled: false },
	);

	const create = useCreateInvoice();

	function submit() {
		if (!organizationId || !customerId || !total) {
			toast.error("Select a customer and enter an amount");
			return;
		}
		const totalNum = Number.parseFloat(total);
		if (!Number.isFinite(totalNum) || totalNum < 0) {
			toast.error("Invalid total");
			return;
		}
		create.mutate(
			{
				organizationId,
				customerId,
				year,
				month,
				total: totalNum,
				discount: Number.parseFloat(discount) || 0,
				tax: Number.parseFloat(tax) || 0,
			},
			{
				onSuccess: () => {
					toast.success("Invoice created");
					onOpenChange(false);
				},
				onError: (err) => toast.error(err.message || "Failed"),
			},
		);
	}

	const selectedCustomer = customerResults?.customers?.find(
		(c) => c.id === customerId,
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New Invoice</DialogTitle>
					<DialogDescription>
						Manually create an invoice for a customer.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<Label>Customer</Label>
						{selectedCustomer ? (
							<div className="flex items-center justify-between rounded-md border p-2 text-sm">
								<span>
									{selectedCustomer.firstName}{" "}
									{selectedCustomer.lastName} —{" "}
									{selectedCustomer.username}
								</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setCustomerId(null)}
								>
									Change
								</Button>
							</div>
						) : (
							<>
								<Input
									placeholder="Search by name, username, phone..."
									value={search}
									onChange={(e) => setSearch(e.target.value)}
								/>
								{customerResults?.customers &&
									customerResults.customers.length > 0 && (
										<div className="mt-2 max-h-48 overflow-auto rounded-md border">
											{customerResults.customers.map(
												(c) => (
													<button
														type="button"
														key={c.id}
														onClick={() => {
															setCustomerId(c.id);
															setSearch("");
														}}
														className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
													>
														<span>
															{c.firstName}{" "}
															{c.lastName}
														</span>
														<span className="text-xs text-muted-foreground">
															{c.username}
														</span>
													</button>
												),
											)}
										</div>
									)}
							</>
						)}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="year">Year</Label>
							<Input
								id="year"
								type="number"
								value={year}
								onChange={(e) =>
									setYear(Number.parseInt(e.target.value, 10))
								}
							/>
						</div>
						<div>
							<Label htmlFor="month">Month</Label>
							<Input
								id="month"
								type="number"
								min={1}
								max={12}
								value={month}
								onChange={(e) =>
									setMonth(
										Number.parseInt(e.target.value, 10),
									)
								}
							/>
						</div>
					</div>

					<div>
						<Label htmlFor="total">Total</Label>
						<Input
							id="total"
							type="number"
							step="0.01"
							value={total}
							onChange={(e) => setTotal(e.target.value)}
							placeholder="0.00"
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="discount">Discount</Label>
							<Input
								id="discount"
								type="number"
								step="0.01"
								value={discount}
								onChange={(e) => setDiscount(e.target.value)}
							/>
						</div>
						<div>
							<Label htmlFor="tax">Tax</Label>
							<Input
								id="tax"
								type="number"
								step="0.01"
								value={tax}
								onChange={(e) => setTax(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={create.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={submit}
						disabled={!customerId || !total || create.isPending}
					>
						{create.isPending ? "Creating..." : "Create Invoice"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
