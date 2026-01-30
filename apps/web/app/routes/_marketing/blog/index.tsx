import { PostListItem } from "@marketing/blog/components/PostListItem";
import type { Post } from "@marketing/blog/types";
import { getAllPosts } from "@marketing/blog/utils/lib/posts";
import { config } from "@repo/config";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getBlogPostsFn = createServerFn({ method: "GET" }).handler(async () => {
	const posts = await getAllPosts();
	// Filter to only published posts, sorted by date
	return posts
		.filter((post) => post.published)
		.sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
		);
});

export const Route = createFileRoute("/_marketing/blog/")({
	loader: () => getBlogPostsFn(),
	head: () => ({
		meta: [
			{ title: `Blog - ${config.appName}` },
			{
				name: "description",
				content: "Read the latest articles and updates from our team.",
			},
		],
	}),
	component: BlogListPage,
});

function BlogListPage() {
	const posts = Route.useLoaderData();

	return (
		<div className="container max-w-6xl pt-32 pb-16">
			<div className="mb-12 pt-8 text-center">
				<h1 className="mb-2 font-bold text-5xl">Blog</h1>
				<p className="text-lg opacity-50">
					Read the latest articles and updates from our team.
				</p>
			</div>

			<div className="grid gap-8 md:grid-cols-2">
				{posts.map((post) => (
					<PostListItem post={post as Post} key={post.path} />
				))}
			</div>
		</div>
	);
}
