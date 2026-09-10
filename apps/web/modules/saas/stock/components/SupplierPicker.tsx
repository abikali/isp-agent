"use client";

import { type PhoneRow, PhoneRows } from "@shared/components/PhoneRows";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateSupplier, useSuppliersQuery } from "../hooks/use-stock";

/**
 * Multi-select of the org's suppliers with an inline "new supplier" form, so
 * the admin never leaves the item dialog to record who they buy from.
 */
export function SupplierPicker({
	value,
	onChange,
}: {
	value: string[];
	onChange: (next: string[]) => void;
}) {
	const organizationId = useOrganizationId();
	const { suppliers } = useSuppliersQuery();
	const createSupplier = useCreateSupplier();
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const [phones, setPhones] = useState<PhoneRow[]>([]);

	function toggle(id: string) {
		onChange(
			value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
		);
	}

	async function handleCreate() {
		if (!organizationId || !name.trim()) {
			return;
		}
		try {
			const { supplier } = await createSupplier.mutateAsync({
				organizationId,
				name: name.trim(),
				phones: phones
					.filter((p) => p.number.trim())
					.map((p, i) => ({
						number: p.number.trim(),
						primary: i === 0,
					})),
			});
			onChange([...value, supplier.id]);
			setName("");
			setPhones([]);
			setAdding(false);
			toast.success(`Supplier "${supplier.name}" added`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to add supplier",
			);
		}
	}

	return (
		<div className="space-y-2">
			{suppliers.length > 0 && (
				<div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
					{suppliers.map((s) => {
						const id = `supplier-${s.id}`;
						return (
							<div key={s.id} className="flex items-center gap-2">
								<Checkbox
									id={id}
									checked={value.includes(s.id)}
									onCheckedChange={() => toggle(s.id)}
								/>
								<Label
									htmlFor={id}
									className="flex-1 font-normal"
								>
									{s.name}
									{s._count.items > 0 && (
										<span className="ml-1 text-xs text-muted-foreground">
											· {s._count.items}{" "}
											{s._count.items === 1
												? "item"
												: "items"}
										</span>
									)}
								</Label>
							</div>
						);
					})}
				</div>
			)}
			{adding ? (
				<div className="space-y-2 rounded-md border border-dashed p-3">
					<div className="flex items-center justify-between">
						<Label htmlFor="new-supplier-name">New supplier</Label>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => setAdding(false)}
						>
							<XIcon className="size-4" />
						</Button>
					</div>
					<Input
						id="new-supplier-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="e.g. Ali Electronics"
					/>
					<PhoneRows phones={phones} onChange={setPhones} />
					<Button
						type="button"
						size="sm"
						onClick={handleCreate}
						disabled={!name.trim() || createSupplier.isPending}
					>
						{createSupplier.isPending ? "Saving…" : "Save supplier"}
					</Button>
				</div>
			) : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 text-xs"
					onClick={() => setAdding(true)}
				>
					<PlusIcon className="mr-1 size-3.5" />
					New supplier
				</Button>
			)}
			{value.length > 0 && suppliers.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{value.map((id) => {
						const s = suppliers.find((x) => x.id === id);
						return s ? (
							<Badge key={id} variant="secondary">
								{s.name}
							</Badge>
						) : null;
					})}
				</div>
			)}
		</div>
	);
}
