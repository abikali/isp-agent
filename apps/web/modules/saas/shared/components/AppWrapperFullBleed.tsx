"use client";

import { AppShell } from "@shared/components/AppShell";
import type { PropsWithChildren } from "react";

/**
 * @deprecated Use `AppShell` directly. Full-bleed pages opt out of
 * page-level padding by not using `<PageShell>` inside.
 *
 * Kept as a thin alias so existing full-bleed routes (ProfileBuilder, etc.)
 * keep working without changes.
 */
export function AppWrapperFullBleed({ children }: PropsWithChildren) {
	return <AppShell>{children}</AppShell>;
}
