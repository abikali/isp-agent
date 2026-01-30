"use client";

import { Link, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";

export function TabGroup({
	items,
	className,
}: {
	items: { label: string; href: string; segment: string }[];
	className?: string;
}) {
	const location = useLocation();
	const pathname = location.pathname;
	// Extract the last segment from pathname to match TanStack Router behavior
	const selectedSegment = pathname.split("/").filter(Boolean).pop() ?? "";
	const activeItem = useMemo(() => {
		return items.find((item) => item.segment === selectedSegment);
	}, [items, selectedSegment]);

	return (
		<div className={` flex border-b-2 ${className}`}>
			{items.map((item) => (
				<Link
					key={item.href}
					to={item.href}
					className={`-mb-0.5 block border-b-2 px-3 py-2.5 text-sm sm:px-6 sm:py-3 sm:text-base ${
						item === activeItem
							? "border-primary font-bold"
							: "border-transparent"
					}`}
				>
					{item.label}
				</Link>
			))}
		</div>
	);
}
