import slugify from "@sindresorhus/slugify";

export type ContentStructureItem = {
	label: string;
	path: string;
	children: ContentStructureItem[];
	isPage: boolean;
};

export function getContentStructure({
	documents,
	meta,
	locale,
}: {
	documents: {
		path: string;
		locale: string;
		title: string;
	}[];
	meta: {
		path: string;
		locale: string;
		data: Record<string, string | { title: string }>;
	}[];
	locale?: string;
}) {
	const contentStructure: ContentStructureItem[] = [];

	function addToContentItemArray(
		contentItemsArray: ContentStructureItem[],
		subPath: string,
		item: (typeof documents)[number],
	) {
		const pathParts = item.path
			.replace(new RegExp(`^${subPath}[/]*`), "")
			.split("/");

		const firstPathPart = pathParts[0] ?? "";
		const rootItemPath = subPath
			? [subPath, firstPathPart].join("/")
			: firstPathPart;

		let rootItem = contentItemsArray.find(
			(contentItem) => contentItem.path === rootItemPath,
		);

		const isPage = pathParts.length === 1;
		if (!rootItem) {
			const path = isPage ? item.path : rootItemPath;
			const metaDataEntry = meta
				.filter((meta) => meta.path === subPath)
				.sort((page) => (page.locale === locale ? -1 : 1))
				.at(0);
			const metaData =
				firstPathPart && metaDataEntry
					? metaDataEntry.data[firstPathPart]
					: undefined;
			const label = metaData
				? typeof metaData === "string"
					? metaData
					: metaData.title
				: (documents
						.filter((page) => page.path === rootItemPath)
						.sort((page) => (page.locale === locale ? -1 : 1))
						.at(0)?.title ?? firstPathPart);

			rootItem = {
				label,
				path,
				children: [],
				isPage,
			};

			contentItemsArray.push(rootItem);
		}

		if (isPage && !rootItem.isPage) {
			rootItem.isPage = true;
		}

		if (pathParts.length > 1 && rootItem) {
			addToContentItemArray(rootItem.children, rootItemPath, item);
		}
	}

	documents.forEach((page) => {
		addToContentItemArray(contentStructure, "", page);
	});

	// recusrively sort items and their children
	function sortContentItems(items: ContentStructureItem[], basePath = "") {
		items.sort((a, b) => {
			if (a.path === "") {
				return -1;
			}
			if (b.path === "") {
				return 1;
			}

			const aIndex = Object.entries(
				meta
					.filter((meta) => meta.path === basePath)
					.sort((page) => (page.locale === locale ? -1 : 1))
					.at(0)?.data ?? {},
			).findIndex(([key]) => key === a.path.replace(`${basePath}/`, ""));

			const bIndex = Object.entries(
				meta
					.filter((meta) => meta.path === basePath)
					.sort((page) => (page.locale === locale ? -1 : 1))
					.at(0)?.data ?? {},
			).findIndex(([key]) => key === b.path.replace(`${basePath}/`, ""));

			// use position index from meta file or put the item at the end of the list
			return (
				(aIndex > -1 ? aIndex : items.length) -
				(bIndex > -1 ? bIndex : items.length)
			);
		});

		items.forEach((item) => {
			if (item.children.length) {
				sortContentItems(item.children, item.path);
			}
		});
	}

	sortContentItems(contentStructure);

	return contentStructure;
}

export function getActivePathFromUrlParam(path: string | string[]) {
	return Array.isArray(path) ? path.join("/") : path || "";
}

export function getLocalizedDocumentWithFallback<
	T extends { path: string; locale: string },
>(documents: T[], path: string, locale: string) {
	return documents
		.filter((doc) => doc.path === path)
		.sort((doc) => (doc.locale === locale ? -1 : 1))[0];
}

export function slugifyHeadline(headline: string) {
	return slugify(headline, {
		lowercase: true,
		separator: "-",
	});
}
