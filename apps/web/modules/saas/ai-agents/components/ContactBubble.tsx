"use client";

import { formatWhatsAppLink } from "@saas/billing/lib/whatsapp";
import { Button } from "@ui/components/button";
import { CopyIcon, MessageCircleIcon, UserRoundIcon } from "lucide-react";
import { toast } from "sonner";

interface SharedContact {
	name: string;
	numbers: string[];
}

/** A contact card the customer shared: the name and every number, copyable. */
export function ContactBubble({
	meta,
}: {
	meta?: Record<string, unknown> | null | undefined;
}) {
	const contacts = Array.isArray(meta?.contacts)
		? (meta.contacts as SharedContact[])
		: [];
	if (contacts.length === 0) {
		return null;
	}
	return (
		<div className="mb-1 space-y-2">
			{contacts.map((contact) => (
				<div
					key={`${contact.name}-${contact.numbers.join(",")}`}
					className="rounded-lg border border-border bg-background/60 p-2.5"
				>
					<div className="flex items-center gap-2 text-sm font-medium">
						<UserRoundIcon className="size-4 text-muted-foreground" />
						{contact.name}
					</div>
					{contact.numbers.map((number) => {
						const wa = formatWhatsAppLink(number);
						return (
							<div
								key={number}
								className="mt-1.5 flex items-center gap-1.5 font-mono text-xs"
							>
								<span className="flex-1">{number}</span>
								<Button
									variant="ghost"
									size="icon"
									className="size-6"
									aria-label="Copy number"
									onClick={() => {
										navigator.clipboard
											.writeText(number)
											.then(() => toast.success("Copied"))
											.catch(() =>
												toast.error("Copy failed"),
											);
									}}
								>
									<CopyIcon className="size-3" />
								</Button>
								{wa && (
									<Button
										variant="ghost"
										size="icon"
										className="size-6 text-success"
										asChild
									>
										<a
											href={wa}
											target="_blank"
											rel="noopener noreferrer"
											aria-label="Open in WhatsApp"
										>
											<MessageCircleIcon className="size-3" />
										</a>
									</Button>
								)}
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}
