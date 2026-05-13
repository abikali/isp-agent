"use client";

import { AppShell } from "@shared/components/AppShell";
import type { PropsWithChildren } from "react";

/**
 * @deprecated Use `AppShell` from `@shared/components/AppShell` directly.
 * Thin alias kept so legacy routes that import `@saas/shared/client`
 * continue to render under the redesigned shell without code changes.
 */
export function AppWrapper({ children }: PropsWithChildren) {
	return <AppShell>{children}</AppShell>;
}
