"use client";

import { displayName } from "@shared/lib/display-name";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import { cn } from "@ui/lib";
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";

interface CustomerComboboxValue {
	id: string;
	name: string;
	username: string | null;
	mobile?: string | null;
}

interface CustomerComboboxProps {
	value: CustomerComboboxValue | null;
	onChange: (customer: CustomerComboboxValue | null) => void;
	placeholder?: string;
	excludeCustomerId?: string;
	disabled?: boolean;
	className?: string;
}

/**
 * Searchable customer picker. Debounced server-side search via `customers.list`,
 * renders inside a Popover. Mobile-first: the dropdown uses max-width clamping
 * and scrolls internally so it works at 360px.
 */
export function CustomerCombobox({
	value,
	onChange,
	placeholder = "Select customer…",
	excludeCustomerId,
	disabled,
	className,
}: CustomerComboboxProps) {
	const organizationId = useOrganizationId();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 250 });

	const query = useQuery(
		organizationId
			? orpc.customers.searchForPicker.queryOptions({
					input: {
						organizationId,
						search: debouncedSearch || undefined,
						excludeCustomerId,
						pageSize: 20,
					},
				})
			: disabledQuery(["customers", "searchForPicker"]),
	);

	const customers = query.data?.customers ?? [];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					disabled={disabled}
					className={cn(
						"w-full justify-between font-normal",
						!value && "text-muted-foreground",
						className,
					)}
				>
					<span className="truncate">
						{value
							? value.username
								? `${value.name} (@${value.username})`
								: value.name
							: placeholder}
					</span>
					<ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[--radix-popover-trigger-width] min-w-[260px] p-0"
			>
				<div className="p-2">
					<Input
						autoFocus
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search by name or username…"
						className="h-9"
					/>
				</div>
				<div className="max-h-64 overflow-y-auto border-t">
					{query.isLoading ? (
						<div className="flex items-center justify-center py-6 text-muted-foreground">
							<Loader2Icon className="size-4 animate-spin" />
						</div>
					) : customers.length === 0 ? (
						<div className="py-6 text-center text-sm text-muted-foreground">
							No customers found
						</div>
					) : (
						<ul className="py-1">
							{value && (
								<li>
									<button
										type="button"
										onClick={() => {
											onChange(null);
											setOpen(false);
										}}
										className="flex w-full items-center px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
									>
										Clear selection
									</button>
								</li>
							)}
							{customers.map((c) => {
								const name = displayName(
									c.firstName,
									c.lastName,
								);
								const isSelected = value?.id === c.id;
								return (
									<li key={c.id}>
										<button
											type="button"
											onClick={() => {
												onChange({
													id: c.id,
													name,
													username:
														c.username ?? null,
													mobile: c.mobile ?? null,
												});
												setOpen(false);
												setSearch("");
											}}
											className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
										>
											<CheckIcon
												className={cn(
													"size-4 shrink-0",
													isSelected
														? "opacity-100"
														: "opacity-0",
												)}
											/>
											<span className="min-w-0 flex-1 truncate">
												{name}
												{c.username && (
													<span className="ml-1 text-muted-foreground">
														@{c.username}
													</span>
												)}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
