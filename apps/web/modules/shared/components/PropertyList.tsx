import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

interface PropertyItem {
	label: string;
	value: ReactNode;
	mono?: boolean;
	copyable?: boolean;
	hidden?: boolean;
}

interface PropertyListProps {
	items: PropertyItem[];
	columns?: 2 | 3 | 4;
}

const columnClass: Record<number, string> = {
	2: "grid-cols-1 sm:grid-cols-2",
	3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
	4: "grid-cols-2 lg:grid-cols-4",
};

export function PropertyList({ items, columns = 3 }: PropertyListProps) {
	const visibleItems = items.filter(
		(item) => !item.hidden && item.value != null && item.value !== "",
	);

	if (visibleItems.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">No data available</p>
		);
	}

	return (
		<dl className={cn("grid gap-x-8 gap-y-3", columnClass[columns])}>
			{visibleItems.map((item) => (
				<PropertyItem key={item.label} {...item} />
			))}
		</dl>
	);
}

function PropertyItem({ label, value, mono, copyable }: PropertyItem) {
	const [copied, setCopied] = useState(false);

	function handleCopy() {
		if (typeof value === "string" || typeof value === "number") {
			navigator.clipboard.writeText(String(value));
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}
	}

	return (
		<div className="space-y-1">
			<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</dt>
			<dd className="flex items-center gap-1.5">
				<span className={cn("text-sm", mono && "font-mono")}>
					{typeof value === "boolean"
						? value
							? "Yes"
							: "No"
						: value}
				</span>
				{copyable &&
					(typeof value === "string" ||
						typeof value === "number") && (
						<button
							type="button"
							onClick={handleCopy}
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							{copied ? (
								<CheckIcon className="size-3" />
							) : (
								<CopyIcon className="size-3" />
							)}
						</button>
					)}
			</dd>
		</div>
	);
}

interface PropertyListSkeletonProps {
	count?: number;
	columns?: 2 | 3 | 4;
}

export function PropertyListSkeleton({
	count = 6,
	columns = 3,
}: PropertyListSkeletonProps) {
	return (
		<div className={cn("grid gap-x-8 gap-y-3", columnClass[columns])}>
			{Array.from({ length: count }).map((_, i) => (
				<div key={`prop-skel-${i}`} className="space-y-1">
					<Skeleton className="h-3 w-16" />
					<Skeleton className="h-4 w-24" />
				</div>
			))}
		</div>
	);
}
