"use client";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/components/alert-dialog";
import { Button } from "@ui/components/button";
import {
	createContext,
	type PropsWithChildren,
	use,
	useMemo,
	useState,
} from "react";

type ConfirmOptions = {
	title: string;
	message?: string;
	cancelLabel?: string;
	confirmLabel?: string;
	destructive?: boolean;
	onConfirm: () => Promise<void> | void;
};
const ConfirmationAlertContext = createContext<{
	confirm: (options: ConfirmOptions) => void;
}>({
	confirm: async () => false,
});

export function ConfirmationAlertProvider({ children }: PropsWithChildren) {
	const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(
		null,
	);
	// Locked from the first click on Confirm until onConfirm settles. A second
	// click during that window used to fire onConfirm again — with a money
	// action behind it, that wrote a dealer credit to iRadius twice.
	const [pending, setPending] = useState(false);

	const value = useMemo(
		() => ({
			confirm: (options: ConfirmOptions) => {
				setConfirmOptions(options);
			},
		}),
		[],
	);

	return (
		<ConfirmationAlertContext.Provider value={value}>
			{children}

			<AlertDialog
				open={!!confirmOptions}
				onOpenChange={(open) => {
					if (pending) {
						return;
					}
					setConfirmOptions(open ? confirmOptions : null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirmOptions?.title}
						</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogDescription>
						{confirmOptions?.message}
					</AlertDialogDescription>

					<AlertDialogFooter>
						<AlertDialogCancel disabled={pending}>
							{confirmOptions?.cancelLabel ?? "Cancel"}
						</AlertDialogCancel>
						<Button
							variant={
								confirmOptions?.destructive
									? "destructive"
									: "primary"
							}
							disabled={pending}
							onClick={async () => {
								if (pending) {
									return;
								}
								setPending(true);
								try {
									await confirmOptions?.onConfirm();
								} finally {
									setPending(false);
									setConfirmOptions(null);
								}
							}}
						>
							{confirmOptions?.confirmLabel ?? "Confirm"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</ConfirmationAlertContext.Provider>
	);
}

export const useConfirmationAlert = () => {
	const context = use(ConfirmationAlertContext);

	if (!context) {
		throw new Error(
			"useConfirmationAlert must be used within a ConfirmationAlertProvider",
		);
	}

	return context;
};
