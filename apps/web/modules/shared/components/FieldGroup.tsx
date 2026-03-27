import { cn } from "@ui/lib";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

interface FieldGroupProps {
	columns?: 1 | 2 | 3 | 4;
	children: ReactNode;
}

const columnClass: Record<number, string> = {
	1: "grid-cols-1",
	2: "grid-cols-1 sm:grid-cols-2",
	3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
	4: "grid-cols-2 lg:grid-cols-4",
};

export function FieldGroup({ columns = 2, children }: FieldGroupProps) {
	return (
		<div className={cn("grid gap-x-6 gap-y-4", columnClass[columns])}>
			{children}
		</div>
	);
}

interface ReadOnlyFieldProps {
	label: string;
	value: ReactNode;
	mono?: boolean;
	copyable?: boolean;
}

export function ReadOnlyField({
	label,
	value,
	mono,
	copyable,
}: ReadOnlyFieldProps) {
	const [copied, setCopied] = useState(false);

	function handleCopy() {
		if (typeof value === "string" || typeof value === "number") {
			navigator.clipboard.writeText(String(value));
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}
	}

	if (value == null || value === "") {
		return (
			<div className="space-y-1.5">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</p>
				<p className="text-sm text-muted-foreground/60">-</p>
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<div className="flex items-center gap-1.5">
				<p className={cn("text-sm", mono && "font-mono")}>{value}</p>
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
			</div>
		</div>
	);
}
