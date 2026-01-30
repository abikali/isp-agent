import { Button } from "@react-email/components";
import React, { type PropsWithChildren } from "react";

export default function PrimaryButton({
	href,
	children,
}: PropsWithChildren<{
	href: string;
}>) {
	return (
		<Button
			href={href}
			className="inline-block rounded-lg bg-primary px-6 py-3 text-center font-semibold text-primary-foreground text-sm no-underline"
		>
			{children}
		</Button>
	);
}
