"use client";

// Components
export { CreateDealerDialog } from "./components/CreateDealerDialog";
export { DealerDetail } from "./components/DealerDetail";
export { DealerFilters } from "./components/DealerFilters";
export { DealerStats } from "./components/DealerStats";
export { DealerStatsSkeleton } from "./components/DealerStatsSkeleton";
export { DealersList } from "./components/DealersList";
export { DealersListSkeleton } from "./components/DealersListSkeleton";

// Hooks
export {
	useCreateDealer,
	useDealerStats,
	useDealers,
	useDealersQuery,
	useDeleteDealer,
	useSetActiveDealer,
	useUpdateDealer,
} from "./hooks/use-dealers";
