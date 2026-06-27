import { formatDateInput } from "@shared/lib/format";
import { formatDistance, parseISO } from "date-fns";
import type { ChangelogItem } from "../types";

export function ChangelogSection({ items }: { items: ChangelogItem[] }) {
	return (
		<section id="changelog">
			<div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-4 text-left">
				{items?.map((item) => (
					<div
						key={item.date}
						className="rounded-xl border bg-card p-6"
					>
						<small
							className="inline-block rounded-full border border-highlight/50 px-2 py-0.5 font-semibold text-highlight text-xs"
							title={formatDateInput(parseISO(item.date))}
							suppressHydrationWarning
						>
							{/* react-doctor-disable-next-line react-doctor/rendering-hydration-mismatch-time -- relative time; the parent <small> already carries suppressHydrationWarning so the server/client divergence is intentional */}
							{formatDistance(parseISO(item.date), new Date(), {
								addSuffix: true,
							})}
						</small>
						<ul className="mt-4 list-disc space-y-2 pl-6">
							{item.changes.map((change, j) => (
								<li key={j}>{change}</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</section>
	);
}
