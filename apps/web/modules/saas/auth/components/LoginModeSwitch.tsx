"use client";

import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";

export function LoginModeSwitch({
	activeMode,
	onChange,
	className,
}: {
	activeMode: "password" | "magic-link";
	onChange: (mode: string) => void;
	className?: string;
}) {
	return (
		<Tabs value={activeMode} onValueChange={onChange} className={className}>
			<TabsList className="w-full">
				<TabsTrigger value="password" className="flex-1">
					Password
				</TabsTrigger>
				<TabsTrigger value="magic-link" className="flex-1">
					Magic Link
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}
