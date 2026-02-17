"use client";

import { cn } from "@ui/lib";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];

export const ChatMarkdown = memo(function ChatMarkdown({
	content,
	className,
}: {
	content: string;
	className?: string | undefined;
}) {
	return (
		<div
			className={cn(
				"chat-markdown text-[14px] leading-relaxed",
				className,
			)}
		>
			<Markdown
				remarkPlugins={remarkPlugins}
				components={{
					p: ({ children }) => (
						<p className="mb-2 last:mb-0">{children}</p>
					),
					strong: ({ children }) => (
						<strong className="font-semibold">{children}</strong>
					),
					a: ({ href, children }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-2 hover:opacity-80"
						>
							{children}
						</a>
					),
					h1: ({ children }) => (
						<h1 className="mb-2 mt-3 font-semibold text-base first:mt-0">
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="mb-2 mt-3 font-semibold text-[14px] first:mt-0">
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className="mb-1 mt-2 font-semibold text-[14px] first:mt-0">
							{children}
						</h3>
					),
					ul: ({ children }) => (
						<ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0 [&_ul]:mb-0 [&_ul]:mt-0.5">
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0 [&_ol]:mb-0 [&_ol]:mt-0.5">
							{children}
						</ol>
					),
					li: ({ children }) => (
						<li className="pl-0.5">{children}</li>
					),
					code: ({
						className: codeClassName,
						children,
						...props
					}) => {
						const isBlock = codeClassName?.includes("language-");
						if (isBlock) {
							return (
								<code
									className={cn("text-[13px]", codeClassName)}
									{...props}
								>
									{children}
								</code>
							);
						}
						return (
							<code className="rounded bg-black/10 px-1 py-0.5 text-[13px] dark:bg-white/10">
								{children}
							</code>
						);
					},
					pre: ({ children }) => (
						<pre className="my-2 overflow-x-auto rounded-lg bg-black/5 p-3 text-[13px] last:mb-0 dark:bg-white/5">
							{children}
						</pre>
					),
					blockquote: ({ children }) => (
						<blockquote className="my-2 border-l-2 border-current/20 pl-3 italic opacity-80 last:mb-0">
							{children}
						</blockquote>
					),
					hr: () => <hr className="my-3 border-current/10" />,
					table: ({ children }) => (
						<div className="my-2 overflow-x-auto last:mb-0">
							<table className="min-w-full text-[13px]">
								{children}
							</table>
						</div>
					),
					th: ({ children }) => (
						<th className="border-b border-current/10 px-2 py-1 text-left font-semibold">
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className="border-b border-current/10 px-2 py-1">
							{children}
						</td>
					),
				}}
			>
				{content}
			</Markdown>
		</div>
	);
});
