import { PostContent } from "@marketing/blog/components/PostContent";
import { config } from "@repo/config";
import {
	getActivePathFromUrlParam,
	getLocalizedDocumentWithFallback,
} from "@shared/lib/content";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { allLegalPages } from "content-collections";

const getLegalPageFn = createServerFn({ method: "GET" })
	.inputValidator((data: { path: string }) => data)
	.handler(async ({ data }) => {
		const activePath = getActivePathFromUrlParam(data.path);
		const page = getLocalizedDocumentWithFallback(
			allLegalPages,
			activePath,
			config.i18n.defaultLocale,
		);

		if (!page) {
			throw notFound();
		}

		return page;
	});

export const Route = createFileRoute("/_marketing/legal/$")({
	loader: ({ params }: { params: { _: string } }) => {
		const path = params._ || "";
		return getLegalPageFn({ data: { path } });
	},
	head: (ctx) => ({
		meta: [
			{
				title: `${ctx.loaderData?.title || "Legal"} - ${config.appName}`,
			},
			{
				property: "og:title",
				content: ctx.loaderData?.title || "Legal",
			},
		],
	}),
	notFoundComponent: () => (
		<div className="container max-w-6xl pt-32 pb-24">
			<div className="text-center">
				<h1 className="font-bold text-4xl">Page not found</h1>
				<p className="mt-4 text-muted-foreground">
					The page you're looking for doesn't exist.
				</p>
			</div>
		</div>
	),
	component: LegalPage,
});

function LegalPage() {
	const page = Route.useLoaderData();
	const { title, body } = page;

	return (
		<div className="container max-w-6xl pt-32 pb-24">
			<div className="mx-auto mb-12 max-w-2xl">
				<h1 className="text-center font-bold text-4xl">{title}</h1>
			</div>

			<PostContent content={body} />
		</div>
	);
}
