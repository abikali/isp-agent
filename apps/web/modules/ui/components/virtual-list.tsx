"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@ui/lib";
import { useEffect, useRef } from "react";

interface VirtualListProps<T> {
	items: T[];
	estimateSize: number;
	overscan?: number;
	renderItem: (item: T, index: number) => React.ReactNode;
	className?: string;
	itemClassName?: string;
	getItemKey?: (index: number) => string | number;
}

export function VirtualList<T>({
	items,
	estimateSize,
	overscan = 5,
	renderItem,
	className,
	itemClassName,
	getItemKey,
}: VirtualListProps<T>) {
	const parentRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => estimateSize,
		overscan,
		...(getItemKey ? { getItemKey } : {}),
	});

	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div ref={parentRef} className={cn("overflow-auto", className)}>
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{virtualItems.map((virtualItem) => {
					const item = items[virtualItem.index];
					if (item === undefined) {
						return null;
					}
					return (
						<div
							key={virtualItem.key}
							className={itemClassName}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								height: `${virtualItem.size}px`,
								transform: `translateY(${virtualItem.start}px)`,
							}}
						>
							{renderItem(item, virtualItem.index)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface VirtualListDynamicProps<T> {
	items: T[];
	estimateSize: number;
	overscan?: number;
	renderItem: (
		item: T,
		index: number,
		measureElement: (node: HTMLElement | null) => void,
	) => React.ReactNode;
	className?: string;
	getItemKey?: (index: number) => string | number;
}

export function VirtualListDynamic<T>({
	items,
	estimateSize,
	overscan = 5,
	renderItem,
	className,
	getItemKey,
}: VirtualListDynamicProps<T>) {
	const parentRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => estimateSize,
		overscan,
		...(getItemKey ? { getItemKey } : {}),
	});

	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div ref={parentRef} className={cn("overflow-auto", className)}>
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{virtualItems.map((virtualItem) => {
					const item = items[virtualItem.index];
					if (item === undefined) {
						return null;
					}
					return (
						<div
							key={virtualItem.key}
							data-index={virtualItem.index}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${virtualItem.start}px)`,
							}}
						>
							{renderItem(
								item,
								virtualItem.index,
								virtualizer.measureElement,
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface InfiniteVirtualListProps<T> {
	items: T[];
	estimateSize: number;
	overscan?: number;
	renderItem: (item: T, index: number) => React.ReactNode;
	className?: string;
	hasNextPage?: boolean;
	isFetchingNextPage?: boolean;
	fetchNextPage?: () => void;
	loadingIndicator?: React.ReactNode;
	/** Gap between items in pixels (default: 16) */
	gap?: number;
}

export function InfiniteVirtualList<T>({
	items,
	estimateSize,
	overscan = 5,
	renderItem,
	className,
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
	loadingIndicator,
	gap = 16,
}: InfiniteVirtualListProps<T>) {
	const parentRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: hasNextPage ? items.length + 1 : items.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => estimateSize,
		overscan,
		gap,
	});

	const virtualItems = virtualizer.getVirtualItems();

	// Fetch next page when scrolling near the end (matches TanStack official example)
	useEffect(() => {
		const [lastItem] = [...virtualItems].reverse();

		if (!lastItem) {
			return;
		}

		if (
			lastItem.index >= items.length - 1 &&
			hasNextPage &&
			!isFetchingNextPage &&
			fetchNextPage
		) {
			fetchNextPage();
		}
	}, [
		hasNextPage,
		fetchNextPage,
		items.length,
		isFetchingNextPage,
		virtualItems,
	]);

	return (
		<div ref={parentRef} className={cn("overflow-auto", className)}>
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{virtualItems.map((virtualItem) => {
					const isLoaderRow = virtualItem.index >= items.length;

					if (isLoaderRow) {
						return (
							<div
								key={virtualItem.key}
								data-index={virtualItem.index}
								ref={virtualizer.measureElement}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									transform: `translateY(${virtualItem.start}px)`,
								}}
							>
								{loadingIndicator ?? (
									<div className="flex items-center justify-center py-4">
										Loading more...
									</div>
								)}
							</div>
						);
					}

					const item = items[virtualItem.index];
					if (item === undefined) {
						return null;
					}

					return (
						<div
							key={virtualItem.key}
							data-index={virtualItem.index}
							ref={virtualizer.measureElement}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${virtualItem.start}px)`,
							}}
						>
							{renderItem(item, virtualItem.index)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
