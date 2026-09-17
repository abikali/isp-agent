"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { PhoneInput } from "@ui/components/phone-input";
import {
	isValidPhone,
	parsePhone,
	stripPhone,
} from "@ui/components/phone-input-utils";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { useState } from "react";
import { toast } from "sonner";
import {
	type DealerFinanceLedger,
	useUpdateDealerContact,
} from "../../hooks/use-dealer-finance";

interface EditDealerContactSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	dealer: DealerFinanceLedger["dealer"];
}

/**
 * Fix a dealer's name, phone and WhatsApp number. Name and phone are saved to
 * iRadius first (the sync would undo a local-only edit); the contact person
 * and WhatsApp number are LibanCom's own. Mount with `key={dealer.id}`.
 */
export function EditDealerContactSheet({
	open,
	onOpenChange,
	dealer,
}: EditDealerContactSheetProps) {
	const organizationId = useOrganizationId();
	const update = useUpdateDealerContact();
	const { contact } = dealer;
	const inIRadius = dealer.isLinked && !dealer.isDeleted;

	const [name, setName] = useState(dealer.name);
	const [phone, setPhone] = useState(contact.phone ?? "");
	const [contactName, setContactName] = useState(contact.contactName ?? "");
	const [whatsapp, setWhatsapp] = useState(contact.whatsappOverride ?? "");

	const whatsappEmpty = parsePhone(whatsapp).localNumber === "";
	const whatsappInvalid = !whatsappEmpty && !isValidPhone(whatsapp);
	const nameMissing = inIRadius && !name.trim();

	const canSubmit =
		!!organizationId &&
		!whatsappInvalid &&
		!nameMissing &&
		!update.isPending;

	async function submit() {
		if (!organizationId || !canSubmit) {
			return;
		}
		try {
			const result = await update.mutateAsync({
				organizationId,
				dealerId: dealer.id,
				...(inIRadius ? { name, phone } : {}),
				contactName,
				whatsappPhone: whatsappEmpty ? null : stripPhone(whatsapp),
			});
			if (result.changed.length === 0) {
				toast.info("Nothing changed.");
			} else {
				toast.success(
					result.whatsappPhone
						? `Saved. Confirmations go to ${result.whatsappPhone}.`
						: "Saved. This dealer still has no WhatsApp number, so confirmations cannot be sent.",
				);
			}
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not save the contact",
			);
		}
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
				<SheetHeader className="border-b border-border pb-4">
					<SheetTitle>Edit contact</SheetTitle>
					<SheetDescription>
						Who this dealer is and where their WhatsApp
						confirmations go.
					</SheetDescription>
				</SheetHeader>

				<form
					id="dealer-contact-form"
					className="flex-1 space-y-5 py-5"
					onSubmit={(e) => {
						e.preventDefault();
						void submit();
					}}
				>
					{inIRadius ? (
						<>
							<div className="space-y-1.5">
								<Label htmlFor="dealer-name">
									Name{" "}
									<span className="font-normal text-muted-foreground">
										(saved to iRadius)
									</span>
								</Label>
								<Input
									id="dealer-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									maxLength={100}
								/>
								{nameMissing && (
									<p className="text-xs text-destructive">
										A dealer needs a name.
									</p>
								)}
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="dealer-phone">
									Phone{" "}
									<span className="font-normal text-muted-foreground">
										(saved to iRadius)
									</span>
								</Label>
								<Input
									id="dealer-phone"
									type="tel"
									value={phone}
									onChange={(e) => setPhone(e.target.value)}
									maxLength={50}
									placeholder="e.g. 70123456"
								/>
							</div>
						</>
					) : (
						<p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
							This dealer is not in iRadius, so its name and phone
							cannot be changed here.
						</p>
					)}

					<div className="space-y-1.5">
						<Label htmlFor="dealer-contact-name">
							Contact person
						</Label>
						<Input
							id="dealer-contact-name"
							value={contactName}
							onChange={(e) => setContactName(e.target.value)}
							maxLength={100}
							placeholder="Who the WhatsApp message greets"
						/>
						<p className="text-xs text-muted-foreground">
							Leave empty to greet them by the dealer name.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label>WhatsApp number</Label>
						<PhoneInput
							value={whatsapp}
							onChange={setWhatsapp}
							placeholder="70 123 456"
						/>
						{whatsappInvalid ? (
							<p className="text-xs text-destructive">
								Not a valid WhatsApp number.
							</p>
						) : (
							<p className="text-xs text-muted-foreground">
								{whatsappEmpty
									? contact.whatsappOverride
										? "Clearing this falls back to the phone above."
										: "Leave empty to use the phone above."
									: "Used for confirmations instead of the phone above."}
							</p>
						)}
					</div>
				</form>

				<div className="flex gap-2 border-t border-border pt-4">
					<Button
						variant="outline"
						className="flex-1"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form="dealer-contact-form"
						className="flex-1"
						disabled={!canSubmit}
					>
						{update.isPending ? "Saving…" : "Save"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
