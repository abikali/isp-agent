"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { Button } from "@ui/components/button";
import { MessageCircleWarningIcon, PencilIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { DealerFinanceLedger } from "../../hooks/use-dealer-finance";

interface DealerContactCardProps {
	dealer: DealerFinanceLedger["dealer"];
	canEdit: boolean;
	onEdit: () => void;
}

/**
 * Who to call and where WhatsApp confirmations go. A dealer without a usable
 * number is called out here, since every money action for them goes unheard.
 */
export function DealerContactCard({
	dealer,
	canEdit,
	onEdit,
}: DealerContactCardProps) {
	const { contact } = dealer;
	const companyNumbers = [contact.companyMobile, contact.companyPhone]
		.filter(Boolean)
		.join(" · ");
	const empty = <span className="text-muted-foreground">—</span>;
	const rows: Array<{ label: string; value: ReactNode }> = [
		{ label: "Contact person", value: contact.contactName ?? empty },
		{ label: "Phone", value: contact.phone ?? empty },
		...(companyNumbers
			? [{ label: "Company", value: companyNumbers }]
			: []),
		{
			label: "WhatsApp",
			value: contact.whatsappPhone ? (
				<span className="font-mono tabular-nums">
					{contact.whatsappPhone}
				</span>
			) : (
				<span className="text-warning">None</span>
			),
		},
	];

	return (
		<ContentCard>
			<ContentCardSection>
				<div className="flex items-center justify-between gap-2">
					<div className="text-sm font-medium">Contact</div>
					{canEdit && (
						<Button
							size="sm"
							variant="ghost"
							className="-my-1"
							onClick={onEdit}
						>
							<PencilIcon className="size-3.5" />
							Edit
						</Button>
					)}
				</div>

				<dl className="mt-3 space-y-2 text-sm">
					{rows.map((row) => (
						<div
							key={row.label}
							className="flex items-baseline justify-between gap-3"
						>
							<dt className="shrink-0 text-muted-foreground">
								{row.label}
							</dt>
							<dd className="min-w-0 truncate text-right">
								{row.value}
							</dd>
						</div>
					))}
				</dl>

				{!contact.whatsappPhone && (
					<p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs">
						<MessageCircleWarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
						{contact.whatsappIssue === "invalid_phone"
							? "None of this dealer's numbers is a valid WhatsApp number, so payment and credit confirmations cannot be sent."
							: "This dealer has no phone number, so payment and credit confirmations cannot be sent."}
					</p>
				)}
			</ContentCardSection>
		</ContentCard>
	);
}
