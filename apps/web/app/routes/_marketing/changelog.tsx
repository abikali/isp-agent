import { ChangelogSection } from "@marketing/changelog/components/ChangelogSection";
import { config } from "@repo/config";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing/changelog")({
	head: () => ({
		meta: [
			{ title: `Changelog - ${config.appName}` },
			{
				name: "description",
				content: "See what's new and what we've been working on.",
			},
		],
	}),
	component: ChangelogPage,
});

function ChangelogPage() {
	return (
		<div className="container max-w-3xl pt-32 pb-16">
			<div className="mb-12 text-balance pt-8 text-center">
				<h1 className="mb-2 font-bold text-5xl">Changelog</h1>
				<p className="text-lg opacity-50">
					See what's new and what we've been working on.
				</p>
			</div>
			<ChangelogSection
				items={[
					{
						date: "2024-03-01",
						changes: ["Improved performance"],
					},
					{
						date: "2024-02-01",
						changes: ["Updated design", "Fixed a bug"],
					},
					{
						date: "2024-01-01",
						changes: ["Added new feature", "Fixed a bug"],
					},
				]}
			/>
		</div>
	);
}
