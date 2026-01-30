"use client";

import { useTheme } from "@shared/hooks/use-theme";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme } = useTheme();
	const toasterTheme =
		theme === "light" || theme === "dark" || theme === "system"
			? theme
			: "system";

	return (
		<Sonner
			theme={toasterTheme}
			className="toaster group"
			toastOptions={{
				classNames: {
					toast: "group toast !rounded-xl !font-sans group-[.toaster]:bg-card/95 group-[.toaster]:backdrop-blur-sm group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
					description: "group-[.toast]:text-muted-foreground",
					actionButton:
						"group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
					cancelButton:
						"group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
					success: "!text-success !border-success/20",
					error: "!text-destructive !border-destructive/20",
				},
				duration: 5000,
			}}
			{...props}
		/>
	);
};

export { Toaster };
