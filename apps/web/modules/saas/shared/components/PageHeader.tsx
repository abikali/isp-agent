"use client";

export function PageHeader({
	title,
	subtitle,
}: {
	title: string;
	subtitle?: string;
}) {
	return (
		<div className="mb-4 sm:mb-8">
			<h2 className="font-bold text-xl sm:text-2xl lg:text-3xl">
				{title}
			</h2>
			<p className="mt-1 text-sm sm:text-base opacity-60">{subtitle}</p>
		</div>
	);
}
