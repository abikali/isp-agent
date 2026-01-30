import { MDXContent } from "@content-collections/mdx/react";
import { config } from "@repo/config";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { docsSource } from "../../../docs-source";

const getDocPageFn = createServerFn({ method: "GET" })
	.inputValidator((data: { path: string[] }) => data)
	.handler(async ({ data }) => {
		const page = docsSource.getPage(data.path, config.i18n.defaultLocale);

		if (!page) {
			throw notFound();
		}

		return {
			title: page.data.title,
			description: page.data.description,
			body: page.data.body,
			toc: page.data.toc,
			full: page.data.full ?? false,
		};
	});

export const Route = createFileRoute("/_marketing/docs/$")({
	loader: ({ params }: { params: { _: string } }) => {
		// Convert splat params to path array
		const pathStr = params._ || "";
		const path = pathStr ? pathStr.split("/") : [];
		return getDocPageFn({ data: { path } });
	},
	head: (ctx) => ({
		meta: [
			{
				title: `${ctx.loaderData?.title || "Documentation"} | ${config.appName} Docs`,
			},
			{
				name: "description",
				content: ctx.loaderData?.description || "",
			},
		],
	}),
	notFoundComponent: () => (
		<div className="container max-w-6xl pt-32 pb-24">
			<div className="text-center">
				<h1 className="font-bold text-4xl">Page not found</h1>
				<p className="mt-4 text-muted-foreground">
					The documentation page you're looking for doesn't exist.
				</p>
			</div>
		</div>
	),
	component: DocsPage,
});

function DocsPage() {
	const page = Route.useLoaderData();

	return (
		<div className="container max-w-6xl pt-32 pb-24">
			<div className="mx-auto max-w-3xl">
				<h1 className="text-foreground font-bold text-4xl">
					{page.title}
				</h1>
				{page.description && (
					<p className="mt-4 text-foreground/50 text-lg">
						{page.description}
					</p>
				)}
				<div className="prose dark:prose-invert max-w-full mt-8 prose-a:text-foreground prose-p:text-foreground/80">
					<MDXContent code={page.body} />
				</div>
			</div>
		</div>
	);
}
