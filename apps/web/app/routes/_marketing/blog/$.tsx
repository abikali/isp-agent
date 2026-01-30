import { PostContent } from "@marketing/blog/components/PostContent";
import { getPostBySlug } from "@marketing/blog/utils/lib/posts";
import { config } from "@repo/config";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getPostFn = createServerFn({ method: "GET" })
	.inputValidator((data: { slug: string }) => data)
	.handler(async ({ data }) => {
		const post = await getPostBySlug(data.slug, {});

		if (!post) {
			throw notFound();
		}

		return post;
	});

export const Route = createFileRoute("/_marketing/blog/$")({
	loader: ({ params }: { params: { _: string } }) => {
		const slug = params._ || "";
		return getPostFn({ data: { slug } });
	},
	head: (ctx) => ({
		meta: [
			{
				title: `${ctx.loaderData?.title || "Blog Post"} - ${config.appName}`,
			},
			{
				name: "description",
				content: ctx.loaderData?.excerpt || "",
			},
			{
				property: "og:title",
				content: ctx.loaderData?.title || "Blog Post",
			},
			{
				property: "og:description",
				content: ctx.loaderData?.excerpt || "",
			},
		],
	}),
	notFoundComponent: () => (
		<div className="container max-w-6xl pt-32 pb-24">
			<div className="text-center">
				<h1 className="font-bold text-4xl">Post not found</h1>
				<p className="mt-4 text-muted-foreground">
					The blog post you're looking for doesn't exist.
				</p>
				<Link to="/blog" className="mt-4 inline-block text-primary">
					&larr; Back to Blog
				</Link>
			</div>
		</div>
	),
	component: BlogPostPage,
});

function BlogPostPage() {
	const post = Route.useLoaderData();
	const { title, date, authorName, authorImage, tags, image, body } = post;

	return (
		<div className="container max-w-6xl pt-32 pb-24">
			<div className="mx-auto max-w-2xl">
				<div className="mb-12">
					<Link to="/blog">&larr; Back to Blog</Link>
				</div>

				<h1 className="font-bold text-4xl">{title}</h1>

				<div className="mt-4 flex items-center justify-start gap-6">
					{authorName && (
						<div className="flex items-center">
							{authorImage && (
								<div className="relative mr-2 size-8 overflow-hidden rounded-full">
									<img
										src={authorImage}
										alt={authorName}
										className="size-full object-cover object-center"
									/>
								</div>
							)}
							<div>
								<p className="font-semibold text-sm opacity-50">
									{authorName}
								</p>
							</div>
						</div>
					)}

					<div className="mr-0 ml-auto">
						<p className="text-sm opacity-30">
							{Intl.DateTimeFormat("en-US").format(
								new Date(date),
							)}
						</p>
					</div>

					{tags && (
						<div className="flex flex-1 flex-wrap gap-2">
							{tags.map((tag: string) => (
								<span
									key={tag}
									className="font-semibold text-primary text-xs uppercase tracking-wider"
								>
									#{tag}
								</span>
							))}
						</div>
					)}
				</div>
			</div>

			{image && (
				<div className="relative mt-6 aspect-video overflow-hidden rounded-xl">
					<img
						src={image}
						alt={title}
						className="size-full object-cover object-center"
					/>
				</div>
			)}

			<div className="pb-8">
				<PostContent content={body} />
			</div>
		</div>
	);
}
