"use client";

import {
	useCreateNoteCategory,
	useDeleteNoteCategory,
	useNoteCategoriesSuspense,
	useUpdateNoteCategory,
} from "@saas/billing/hooks/use-billing";
import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Skeleton } from "@ui/components/skeleton";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface NoteCategoryItem {
	id: string;
	value: string;
	label: string;
	labelAr: string | null;
	sortOrder: number;
}

export function NoteCategoriesSettingsSkeleton() {
	return (
		<SettingsItem
			title="Note Categories"
			description="Manage payment note categories for your organization"
			fullWidth
		>
			<div className="space-y-2">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton
						key={`skel-${i}`}
						className="h-12 w-full rounded-lg"
					/>
				))}
			</div>
		</SettingsItem>
	);
}

export function NoteCategoriesSettings() {
	const organizationId = useOrganizationId();
	const { data } = useNoteCategoriesSuspense();
	const deleteMutation = useDeleteNoteCategory();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingCategory, setEditingCategory] =
		useState<NoteCategoryItem | null>(null);

	const categories = data?.categories ?? [];

	function handleEdit(category: NoteCategoryItem) {
		setEditingCategory(category);
		setDialogOpen(true);
	}

	function handleCreate() {
		setEditingCategory(null);
		setDialogOpen(true);
	}

	function handleDelete(category: NoteCategoryItem) {
		if (!organizationId) {
			return;
		}
		toast.promise(
			deleteMutation.mutateAsync({
				organizationId,
				id: category.id,
			}),
			{
				loading: "Deleting...",
				success: `Deleted "${category.label}"`,
				error: (err) => err?.message || "Failed to delete",
			},
		);
	}

	return (
		<>
			<SettingsItem
				title={
					<div className="flex items-center justify-between">
						<span>Note Categories</span>
						<Button
							size="sm"
							variant="outline"
							onClick={handleCreate}
						>
							<PlusIcon className="mr-1 size-4" />
							Add Category
						</Button>
					</div>
				}
				description="Manage payment note categories used by collectors when recording payments"
				fullWidth
			>
				{categories.length === 0 ? (
					<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
						No note categories yet. Add one to get started.
					</div>
				) : (
					<div className="space-y-1">
						{categories.map((cat) => (
							<div
								key={cat.id}
								className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
							>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="font-medium text-sm">
											{cat.label}
										</span>
										{cat.labelAr && (
											<span className="text-xs text-muted-foreground">
												({cat.labelAr})
											</span>
										)}
									</div>
									<span className="text-xs text-muted-foreground font-mono">
										{cat.value}
									</span>
								</div>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										className="size-8"
										onClick={() => handleEdit(cat)}
									>
										<PencilIcon className="size-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 text-destructive hover:text-destructive"
										onClick={() => handleDelete(cat)}
										disabled={deleteMutation.isPending}
									>
										<TrashIcon className="size-3.5" />
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</SettingsItem>

			{/* key resets internal state when switching between create/edit */}
			<NoteCategoryDialog
				key={editingCategory?.id ?? "new"}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				category={editingCategory}
			/>
		</>
	);
}

function NoteCategoryDialog({
	open,
	onOpenChange,
	category,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	category: NoteCategoryItem | null;
}) {
	const organizationId = useOrganizationId();
	const createMutation = useCreateNoteCategory();
	const updateMutation = useUpdateNoteCategory();

	const isEditing = !!category;
	const [value, setValue] = useState(category?.value ?? "");
	const [label, setLabel] = useState(category?.label ?? "");
	const [labelAr, setLabelAr] = useState(category?.labelAr ?? "");

	const isPending = createMutation.isPending || updateMutation.isPending;

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!organizationId) {
			return;
		}

		if (isEditing && category) {
			toast.promise(
				updateMutation.mutateAsync({
					organizationId,
					id: category.id,
					label,
					labelAr: labelAr || undefined,
				}),
				{
					loading: "Updating...",
					success: () => {
						onOpenChange(false);
						return "Category updated";
					},
					error: (err) => err?.message || "Failed to update",
				},
			);
		} else {
			toast.promise(
				createMutation.mutateAsync({
					organizationId,
					value: value.toUpperCase().replace(/\s+/g, "_"),
					label,
					labelAr: labelAr || undefined,
				}),
				{
					loading: "Creating...",
					success: () => {
						onOpenChange(false);
						return "Category created";
					},
					error: (err) => err?.message || "Failed to create",
				},
			);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Category" : "Add Note Category"}
					</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{!isEditing && (
						<div>
							<Label htmlFor="nc-value">Value (identifier)</Label>
							<Input
								id="nc-value"
								value={value}
								onChange={(e) =>
									setValue(
										e.target.value
											.toUpperCase()
											.replace(/[^A-Z0-9_]/g, ""),
									)
								}
								placeholder="e.g. DOWNGRADE"
								required
								className="mt-1 font-mono"
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								Uppercase letters, numbers, underscores only
							</p>
						</div>
					)}

					<div>
						<Label htmlFor="nc-label">Label</Label>
						<Input
							id="nc-label"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="e.g. Downgrade"
							required
							className="mt-1"
						/>
					</div>

					<div>
						<Label htmlFor="nc-labelAr">
							Arabic Label (optional)
						</Label>
						<Input
							id="nc-labelAr"
							value={labelAr}
							onChange={(e) => setLabelAr(e.target.value)}
							placeholder="e.g. تصغير"
							dir="rtl"
							className="mt-1"
						/>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending
								? "Saving..."
								: isEditing
									? "Save Changes"
									: "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
