import {
	Container,
	Font,
	Head,
	Hr,
	Html,
	Link,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";
import { getBaseUrl } from "@repo/utils";
import React, { type PropsWithChildren } from "react";
import { Logo } from "./Logo";

interface WrapperProps {
	previewText?: string;
}

export default function Wrapper({
	children,
	previewText,
}: PropsWithChildren<WrapperProps>) {
	const baseUrl = getBaseUrl();
	const displayDomain = baseUrl
		.replace(/^https?:\/\//, "")
		.replace(/\/$/, "");

	return (
		<Tailwind
			config={{
				theme: {
					extend: {
						colors: {
							border: "#e3ebf6",
							background: "#f4f4f5",
							foreground: "#18181b",
							muted: {
								DEFAULT: "#f4f4f5",
								foreground: "#71717a",
							},
							primary: {
								DEFAULT: "#18181b",
								foreground: "#fafafa",
							},
							secondary: {
								DEFAULT: "#f4f4f5",
								foreground: "#18181b",
							},
							card: {
								DEFAULT: "#ffffff",
								foreground: "#18181b",
							},
							accent: {
								DEFAULT: "#3b82f6",
								foreground: "#ffffff",
							},
						},
					},
				},
			}}
		>
			<Html lang="en">
				<Head>
					<Font
						fontFamily="Inter"
						fallbackFontFamily="Arial"
						fontWeight={400}
						fontStyle="normal"
					/>
				</Head>
				{previewText && <Preview>{previewText}</Preview>}
				<Section className="bg-background py-8 px-4">
					<Container className="mx-auto max-w-[580px]">
						{/* Header */}
						<Section className="mb-6">
							<Logo />
						</Section>

						{/* Main Content */}
						<Section className="rounded-xl bg-card p-8 shadow-sm">
							{children}
						</Section>

						{/* Footer */}
						<Section className="mt-8 text-center">
							<Text className="m-0 text-muted-foreground text-xs">
								LibanCom - Digital Business Cards
							</Text>
							<Text className="m-0 mt-1 text-muted-foreground text-xs">
								Share your professional identity with a tap.
							</Text>
							<Hr className="my-4 border-border" />
							<Text className="m-0 text-muted-foreground text-xs">
								&copy; {new Date().getFullYear()} LibanCom. All
								rights reserved.
							</Text>
							<Text className="m-0 mt-2 text-muted-foreground text-xs">
								<Link
									href={baseUrl}
									className="text-muted-foreground underline"
								>
									{displayDomain}
								</Link>
							</Text>
						</Section>
					</Container>
				</Section>
			</Html>
		</Tailwind>
	);
}
