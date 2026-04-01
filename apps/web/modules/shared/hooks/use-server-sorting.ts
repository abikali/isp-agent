"use client";

import type { SortingState } from "@tanstack/react-table";
import { useState } from "react";

export function useServerSorting<T extends string>(
	sortByMap: Record<string, T>,
	resetPage?: () => void,
) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const sortColumn = sorting[0];

	const sortBy = sortColumn ? sortByMap[sortColumn.id] : undefined;
	const sortOrder = sortColumn
		? sortColumn.desc
			? ("desc" as const)
			: ("asc" as const)
		: undefined;

	const onSortingChange = (s: SortingState) => {
		setSorting(s);
		resetPage?.();
	};

	return { sorting, sortBy, sortOrder, onSortingChange };
}
