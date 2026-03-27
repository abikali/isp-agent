"use client";

import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Skeleton } from "@ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { Textarea } from "@ui/components/textarea";
import { DollarSignIcon, TrashIcon, WalletIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useCollections,
	useCollectorBalance,
	useCollectors,
	useCreateCollection,
	useDeleteCollection,
} from "../hooks/use-billing";

export function CashCollectionPageSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-48" />
			<div className="grid gap-4 md:grid-cols-2">
				<Skeleton className="h-40" />
				<Skeleton className="h-40" />
			</div>
			<Skeleton className="h-64" />
		</div>
	);
}

export function CashCollectionPage() {
	const organizationId = useOrganizationId();
	const [selectedCollector, setSelectedCollector] = useState<string>("");
	const [page, setPage] = useState(1);

	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

	const { data: balanceData, isLoading: balanceLoading } =
		useCollectorBalance(selectedCollector || null);

	const { data: collectionsData } = useCollections({
		collectorId: selectedCollector || undefined,
		page,
	});

	const createCollection = useCreateCollection();
	const deleteCollection = useDeleteCollection();

	const form = useForm({
		defaultValues: {
			amount: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId || !selectedCollector) {
				return;
			}
			toast.promise(
				createCollection.mutateAsync({
					organizationId,
					collectorId: selectedCollector,
					amount: Number(value.amount),
					notes: value.notes || undefined,
				}),
				{
					loading: "Recording collection...",
					success: () => {
						form.reset();
						return "Collection recorded successfully";
					},
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to record collection",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

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

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold tracking-tight">
					Cash Collection
				</h2>
				<p className="text-muted-foreground">
					Record and track cash handoffs from collectors
				</p>
			</div>

			{/* Collector Selection + Balance */}
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">
							Select Collector
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Select
							value={selectedCollector}
							onValueChange={(val) => {
								setSelectedCollector(val);
								setPage(1);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Choose a collector" />
							</SelectTrigger>
							<SelectContent>
								{collectors.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="flex items-center gap-2 text-sm font-medium">
							<WalletIcon className="h-4 w-4" />
							Amount With Collector
						</CardTitle>
					</CardHeader>
					<CardContent>
						{balanceLoading || !selectedCollector ? (
							<Skeleton className="h-8 w-24" />
						) : (
							<div className="text-2xl font-bold">
								<Badge
									variant={
										(balanceData?.balance ?? 0) > 0
											? "default"
											: "secondary"
									}
									className="text-lg px-3 py-1"
								>
									{formatCurrency(balanceData?.balance ?? 0)}
								</Badge>
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="flex items-center gap-2 text-sm font-medium">
							<DollarSignIcon className="h-4 w-4" />
							Total Collected
						</CardTitle>
					</CardHeader>
					<CardContent>
						{balanceLoading || !selectedCollector ? (
							<Skeleton className="h-8 w-24" />
						) : (
							<div className="space-y-1">
								<p className="text-xl font-semibold">
									{formatCurrency(
										balanceData?.totalCollected ?? 0,
									)}
								</p>
								<p className="text-xs text-muted-foreground">
									Handed off:{" "}
									{formatCurrency(
										balanceData?.totalHandedOff ?? 0,
									)}
								</p>
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Record Collection Form */}
			{selectedCollector && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							Record Cash Handoff
						</CardTitle>
					</CardHeader>
					<CardContent>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
							className="flex flex-wrap items-end gap-4"
						>
							<form.Field name="amount">
								{(field) => (
									<div className="space-y-1">
										<Label htmlFor="amount">Amount</Label>
										<Input
											id="amount"
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
											className="w-40"
											required
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="notes">
								{(field) => (
									<div className="flex-1 space-y-1 min-w-[200px]">
										<Label htmlFor="notes">
											Note (optional)
										</Label>
										<Textarea
											id="notes"
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
											rows={1}
											placeholder="Optional note..."
										/>
									</div>
								)}
							</form.Field>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting
									? "Recording..."
									: "Record Collection"}
							</Button>
						</form>
					</CardContent>
				</Card>
			)}

			{/* Collection History Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Collection History
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Collector</TableHead>
								<TableHead>Amount</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Note</TableHead>
								<TableHead>Received By</TableHead>
								<TableHead className="w-16" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{collectionsData?.collections.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="text-center text-muted-foreground py-8"
									>
										No collection records found
									</TableCell>
								</TableRow>
							) : (
								collectionsData?.collections.map((c) => (
									<TableRow key={c.id}>
										<TableCell className="font-medium">
											{c.collector.name}
										</TableCell>
										<TableCell>
											{formatCurrency(c.amount)}
										</TableCell>
										<TableCell>
											{new Date(
												c.collectedAt,
											).toLocaleDateString()}
										</TableCell>
										<TableCell className="max-w-[200px] truncate">
											{c.notes ?? "—"}
										</TableCell>
										<TableCell>
											{c.receivedBy?.name ?? "—"}
										</TableCell>
										<TableCell>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8 text-destructive"
													>
														<TrashIcon className="h-4 w-4" />
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															Delete collection
															record?
														</AlertDialogTitle>
														<AlertDialogDescription>
															This will
															permanently delete
															this collection
															record of{" "}
															{formatCurrency(
																c.amount,
															)}
															.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>
															Cancel
														</AlertDialogCancel>
														<AlertDialogAction
															onClick={() =>
																handleDelete(
																	c.id,
																)
															}
														>
															Delete
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>

					{/* Pagination */}
					{(collectionsData?.totalPages ?? 0) > 1 && (
						<div className="flex justify-center gap-2 mt-4">
							<Button
								variant="outline"
								size="sm"
								disabled={page <= 1}
								onClick={() => setPage((p) => p - 1)}
							>
								Previous
							</Button>
							<span className="flex items-center text-sm text-muted-foreground">
								Page {page} of {collectionsData?.totalPages}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={
									page >= (collectionsData?.totalPages ?? 1)
								}
								onClick={() => setPage((p) => p + 1)}
							>
								Next
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
