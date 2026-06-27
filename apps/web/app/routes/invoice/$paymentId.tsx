import { config } from "@repo/config";
import { InvoicePage } from "@saas/billing/components/InvoicePage";
import { getBeirutDate } from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeftIcon, FileXIcon } from "lucide-react";

const getInvoiceFn = createServerFn({ method: "GET" })
	.inputValidator((data: { paymentId: string }) => data)
	.handler(async ({ data }) => {
		const queryClient = getServerQueryClient();

		// Check if the invoice exists before populating the cache
		try {
			await queryClient.ensureQueryData(
				orpc.billing.invoice.queryOptions({
					input: { paymentId: data.paymentId },
				}),
			);
		} catch {
			throw notFound();
		}

		return {
			// react-doctor-disable-next-line react-doctor/no-json-parse-stringify-clone -- intentional JSON serialization (not a clone) to strip non-serializable values from the dehydrated query cache before it is sent to the client; the documented SSR pattern
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
			paymentId: data.paymentId,
		};
	});

export const Route = createFileRoute("/invoice/$paymentId")({
	loader: ({ params }) =>
		getInvoiceFn({ data: { paymentId: params.paymentId } }),
	component: InvoiceRoute,
	notFoundComponent: InvoiceNotFound,
});

function InvoiceRoute() {
	const { paymentId } = Route.useParams();
	const loaderData = Route.useLoaderData();

	return (
		<InvoicePage
			paymentId={paymentId}
			dehydratedState={loaderData.dehydratedState}
		/>
	);
}

function InvoiceNotFound() {
	return (
		<div className="flex min-h-screen flex-col bg-gray-100">
			<main className="flex flex-1 items-center justify-center p-4">
				<div className="w-full max-w-md space-y-6 text-center">
					<div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
						<FileXIcon className="size-10 text-muted-foreground" />
					</div>

					<div className="space-y-2">
						<p className="text-6xl font-bold text-muted-foreground/50">
							404
						</p>
						<h1 className="text-2xl font-semibold tracking-tight">
							Invoice not found
						</h1>
						<p className="text-muted-foreground">
							This invoice doesn't exist or may have been removed.
						</p>
					</div>

					<div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
						<button
							type="button"
							onClick={() => window.history.back()}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-white px-6 text-sm font-medium transition-colors hover:bg-gray-50"
						>
							<ArrowLeftIcon className="size-4" />
							Go back
						</button>
					</div>
				</div>
			</main>

			<footer className="py-6 text-center text-xs text-muted-foreground">
				<span>
					&copy; {getBeirutDate().year} {config.appName}
				</span>
			</footer>
		</div>
	);
}
