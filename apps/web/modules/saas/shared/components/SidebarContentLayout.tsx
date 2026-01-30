import type { ReactNode } from "react";

export function SidebarContentLayout({
	children,
	sidebar,
}: {
	children: React.ReactNode;
	sidebar: ReactNode;
}) {
	return (
		<div className="relative">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
				{/* Sidebar - sticky horizontal nav on mobile, sticky vertical nav on desktop */}
				<div className="sticky top-0 z-10 -mx-4 bg-background px-4 pb-2 pt-2 lg:static lg:mx-0 lg:top-4 lg:w-full lg:max-w-[180px] lg:bg-transparent lg:p-0 lg:sticky">
					<div className="border-b pb-2 lg:border-b-0 lg:pb-0">
						{sidebar}
					</div>
				</div>

				{/* Main content */}
				<div className="w-full flex-1">{children}</div>
			</div>
		</div>
	);
}
