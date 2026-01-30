"use client";

import type { Post } from "@marketing/blog/types";
import { Link } from "@tanstack/react-router";

export function PostListItem({ post }: { post: Post }) {
	const { title, excerpt, authorName, image, date, path, authorImage, tags } =
		post;

	return (
		<article className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-border/80">
			{image && (
				<div className="relative -mx-3 -mt-3 mb-4 aspect-video overflow-hidden rounded-lg">
					<img
						src={image}
						alt={title}
						className="absolute inset-0 size-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
					/>
					<Link
						to={`/blog/${path}` as "/"}
						className="absolute inset-0"
					/>
				</div>
			)}

			{tags && (
				<div className="mb-3 flex flex-wrap gap-2">
					{tags.map((tag: string) => (
						<span
							key={tag}
							className="text-xs font-medium text-muted-foreground"
						>
							{tag}
						</span>
					))}
				</div>
			)}

			<Link
				to={`/blog/${path}` as "/"}
				className="font-semibold text-lg leading-snug transition-colors hover:text-foreground/80"
			>
				{title}
			</Link>
			{excerpt && (
				<p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
					{excerpt}
				</p>
			)}

			<div className="mt-4 flex items-center justify-between">
				{authorName && (
					<div className="flex items-center gap-2">
						{authorImage && (
							<div className="relative size-7 overflow-hidden rounded-full">
								<img
									src={authorImage}
									alt={authorName}
									className="absolute inset-0 size-full object-cover object-center"
								/>
							</div>
						)}
						<p className="text-sm text-muted-foreground">
							{authorName}
						</p>
					</div>
				)}

				<time className="ml-auto text-xs text-muted-foreground">
					{Intl.DateTimeFormat("en-US").format(new Date(date))}
				</time>
			</div>
		</article>
	);
}
