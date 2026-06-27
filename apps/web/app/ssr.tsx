import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

// react-doctor-disable-next-line react-doctor/only-export-components -- TanStack Start server entry; the default export is a required framework convention, not a component
export default createServerEntry(
	wrapFetchWithSentry({
		fetch(request) {
			return handler.fetch(request);
		},
	}),
);
