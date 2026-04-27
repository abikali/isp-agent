"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { formatDate } from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import type { DehydratedState } from "@tanstack/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	AlertCircleIcon,
	CheckCircleIcon,
	DownloadIcon,
	PrinterIcon,
} from "lucide-react";

interface InvoicePageProps {
	paymentId: string;
	dehydratedState: DehydratedState;
}

export function InvoicePage({ paymentId, dehydratedState }: InvoicePageProps) {
	return (
		<div className="invoice-page min-h-screen bg-gray-100 py-4 px-2 sm:py-8 sm:px-4 print:bg-white print:py-0 print:px-0">
			<AsyncBoundary
				fallback={<InvoiceSkeleton />}
				dehydratedState={dehydratedState}
				errorFallback="fullPage"
			>
				<InvoiceContent paymentId={paymentId} />
			</AsyncBoundary>
		</div>
	);
}

function InvoiceContent({ paymentId }: { paymentId: string }) {
	const { data } = useSuspenseQuery(
		orpc.billing.invoice.queryOptions({
			input: { paymentId },
		}),
	);

	const { payment } = data;
	const customer = payment.customer;
	const org = payment.organization;
	const cycle = payment.billingMonth;

	// Prefer line items frozen on the invoice at creation time; fall back to
	// the payment/customer snapshot for pre-line-items invoices.
	const invoice = payment.invoice;
	const accountPrice = invoice?.accountPrice ?? payment.accountPrice;
	const iptvPrice = invoice?.iptvPrice ?? customer.iptvPrice ?? 0;
	const realIpPrice = invoice?.realIpPrice ?? customer.realIpPrice ?? 0;
	const discount = invoice?.discount ?? payment.discount;
	const total =
		invoice?.total ?? accountPrice + iptvPrice + realIpPrice - discount;
	const note = invoice?.note ?? null;

	const monthName = new Date(cycle.year, cycle.month - 1).toLocaleString(
		"en-US",
		{ month: "long" },
	);
	const billingPeriod = `${monthName} ${cycle.year}`;

	const statusConfig = getStatusConfig(payment.stoppedAccount);

	const customerName = [customer.firstName, customer.lastName]
		.filter(Boolean)
		.join(" ");
	const invoiceNumber = paymentId.slice(-8).toUpperCase();

	function handlePrint() {
		document.title = `Invoice-${invoiceNumber}-${customerName.replace(/\s+/g, "_")}`;
		window.print();
	}

	return (
		<div className="mx-auto max-w-lg">
			<div className="invoice-card bg-white rounded-2xl shadow-lg overflow-hidden print:shadow-none print:rounded-none">
				{/* Header */}
				<div className="invoice-header bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-6 sm:px-6 sm:py-8 text-white text-center print:py-6">
					{org.logo ? (
						<img
							src={org.logo}
							alt={org.name}
							className="h-12 mx-auto mb-3 object-contain brightness-0 invert"
						/>
					) : (
						<h1 className="text-2xl font-bold tracking-tight">
							{org.name}
						</h1>
					)}
					<p className="text-blue-100 text-sm mt-1">
						Payment Receipt
					</p>
				</div>

				{/* Status Badge */}
				<div className="flex justify-center -mt-5 print:-mt-3">
					<div
						className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-md print:shadow-none print:border ${statusConfig.className}`}
					>
						<statusConfig.icon className="size-4" />
						{statusConfig.label}
					</div>
				</div>

				{/* Invoice Info */}
				<div className="px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
					<div className="flex justify-between text-sm text-gray-500 border-b pb-4">
						<div>
							<p className="text-xs uppercase tracking-wider text-gray-400">
								Invoice
							</p>
							<p className="font-mono font-medium text-gray-700 mt-0.5">
								#{invoiceNumber}
							</p>
						</div>
						<div className="text-right">
							<p className="text-xs uppercase tracking-wider text-gray-400">
								Date
							</p>
							<p className="font-medium text-gray-700 mt-0.5">
								{formatDate(payment.paidAt, {
									year: "numeric",
									month: "short",
									day: "numeric",
								})}
							</p>
						</div>
					</div>

					{/* Customer Info */}
					<div className="py-4 border-b">
						<p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
							Customer
						</p>
						<p className="font-semibold text-gray-900">
							{customerName}
						</p>
						<p className="text-sm text-gray-500 mt-0.5">
							@{customer.username}
						</p>
						<p className="text-sm text-gray-500 mt-0.5">
							Period: {billingPeriod}
						</p>
					</div>

					{/* Line Items Table */}
					<div className="py-4">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b">
									<th className="text-left py-2 text-xs uppercase tracking-wider text-gray-400 font-medium">
										Description
									</th>
									<th className="text-right py-2 text-xs uppercase tracking-wider text-gray-400 font-medium">
										Amount
									</th>
								</tr>
							</thead>
							<tbody>
								<tr className="border-b border-gray-100">
									<td className="py-2.5 text-gray-700">
										Account Price
									</td>
									<td className="py-2.5 text-right tabular-nums text-gray-900">
										{formatUSD(accountPrice)}
									</td>
								</tr>
								{iptvPrice > 0 && (
									<tr className="border-b border-gray-100">
										<td className="py-2.5 text-gray-700">
											IPTV
										</td>
										<td className="py-2.5 text-right tabular-nums text-gray-900">
											{formatUSD(iptvPrice)}
										</td>
									</tr>
								)}
								{realIpPrice > 0 && (
									<tr className="border-b border-gray-100">
										<td className="py-2.5 text-gray-700">
											Real IP
										</td>
										<td className="py-2.5 text-right tabular-nums text-gray-900">
											{formatUSD(realIpPrice)}
										</td>
									</tr>
								)}
								{discount > 0 && (
									<tr className="border-b border-gray-100">
										<td className="py-2.5 text-green-600 print:text-gray-700">
											Discount
										</td>
										<td className="py-2.5 text-right tabular-nums text-green-600 print:text-gray-700">
											-{formatUSD(discount)}
										</td>
									</tr>
								)}
							</tbody>
						</table>

						{/* Total */}
						<div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-gray-900">
							<span className="text-base font-bold text-gray-900">
								Total
							</span>
							<span className="text-xl font-bold tabular-nums text-gray-900">
								{formatUSD(total)}
							</span>
						</div>

						{/* Amount Paid */}
						<div className="flex justify-between items-center pt-2">
							<span className="text-sm text-gray-500">
								Amount Paid
							</span>
							<span className="text-base font-semibold tabular-nums text-blue-600 print:text-gray-900">
								{formatUSD(payment.paidAmount)}
							</span>
						</div>
					</div>

					{/* Note */}
					{note && (
						<div className="border-t pt-3 pb-1 text-sm text-gray-600">
							<p className="text-xs uppercase tracking-wider text-gray-400 mb-1">
								Note
							</p>
							<p className="whitespace-pre-wrap">{note}</p>
						</div>
					)}

					{/* Collector */}
					{payment.collector && (
						<div className="border-t pt-4 pb-2 text-center text-xs text-gray-400">
							Collected by {payment.collector.name}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="bg-gray-50 px-4 py-4 sm:px-6 text-center text-xs text-gray-400 print:bg-white print:border-t">
					Thank you for your payment
				</div>
			</div>

			{/* Action buttons — below the card, hidden when printing */}
			<div className="flex justify-center gap-3 mt-4 print:hidden">
				<button
					type="button"
					onClick={handlePrint}
					className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
				>
					<DownloadIcon className="size-4" />
					Save as PDF
				</button>
				<button
					type="button"
					onClick={handlePrint}
					className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors"
				>
					<PrinterIcon className="size-4" />
					Print
				</button>
			</div>
		</div>
	);
}

function formatUSD(value: number): string {
	return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusConfig(stoppedAccount: boolean) {
	if (stoppedAccount) {
		return {
			label: "Stopped",
			icon: AlertCircleIcon,
			className: "bg-red-100 text-red-700",
		};
	}
	return {
		label: "Paid",
		icon: CheckCircleIcon,
		className: "bg-green-100 text-green-700",
	};
}

function InvoiceSkeleton() {
	return (
		<div className="mx-auto max-w-lg">
			<div className="bg-white rounded-2xl shadow-lg overflow-hidden animate-pulse">
				<div className="bg-blue-600 px-6 py-8 h-28" />
				<div className="px-6 py-6 space-y-4">
					<div className="h-4 bg-gray-200 rounded w-1/3" />
					<div className="h-4 bg-gray-200 rounded w-2/3" />
					<div className="h-4 bg-gray-200 rounded w-1/2" />
					<div className="h-32 bg-gray-200 rounded" />
				</div>
			</div>
		</div>
	);
}
