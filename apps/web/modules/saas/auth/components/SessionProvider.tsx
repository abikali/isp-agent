"use client";
import type { Session, SessionData, User } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { authQueryKeys, useSessionQuery } from "@saas/auth/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { SessionContext } from "../lib/session-context";

interface SessionProviderProps {
	children: ReactNode;
	/** Pre-fetched session from server loader - avoids client-side fetch */
	initialSession?: Session | null;
}

export function SessionProvider({
	children,
	initialSession,
}: SessionProviderProps) {
	const queryClient = useQueryClient();

	// Populate React Query cache with initial session on mount
	useEffect(() => {
		// react-doctor-disable-next-line react-doctor/no-event-handler -- hydrates the React Query cache from the SSR-provided initialSession prop; not driven by a user event
		if (initialSession) {
			queryClient.setQueryData(authQueryKeys.session(), initialSession);
		}
	}, [initialSession, queryClient]);

	const { data: session } = useSessionQuery();

	// Use initial session immediately, then React Query takes over
	const currentSession = session ?? initialSession;

	// Latch "loaded" to true on the first render a session is available and
	// keep it true afterwards (computed during render, no extra render pass).
	const loadedRef = useRef(false);
	if (currentSession) {
		loadedRef.current = true;
	}
	const loaded = loadedRef.current;

	const value = useMemo(
		() => ({
			loaded,
			session:
				(currentSession?.session as SessionData | undefined) ?? null,
			user: (currentSession?.user as User | undefined) ?? null,
			reloadSession: async () => {
				const { data: newSession, error } = await authClient.getSession(
					{
						query: {
							disableCookieCache: true,
						},
					},
				);

				if (error) {
					throw new Error(error.message || "Failed to fetch session");
				}

				queryClient.setQueryData(
					authQueryKeys.session(),
					() => newSession,
				);
			},
		}),
		[loaded, currentSession, queryClient],
	);

	return (
		<SessionContext.Provider value={value}>
			{children}
		</SessionContext.Provider>
	);
}
