"use client";
import type { Session, SessionData, User } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { authQueryKeys, useSessionQuery } from "@saas/auth/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
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
		if (initialSession) {
			queryClient.setQueryData(authQueryKeys.session(), initialSession);
		}
	}, [initialSession, queryClient]);

	const { data: session } = useSessionQuery();

	// Use initial session immediately, then React Query takes over
	const currentSession = session ?? initialSession;
	const [loaded, setLoaded] = useState(!!currentSession);

	useEffect(() => {
		if (currentSession && !loaded) {
			setLoaded(true);
		}
	}, [currentSession, loaded]);

	return (
		<SessionContext.Provider
			value={{
				loaded,
				session:
					(currentSession?.session as SessionData | undefined) ??
					null,
				user: (currentSession?.user as User | undefined) ?? null,
				reloadSession: async () => {
					const { data: newSession, error } =
						await authClient.getSession({
							query: {
								disableCookieCache: true,
							},
						});

					if (error) {
						throw new Error(
							error.message || "Failed to fetch session",
						);
					}

					queryClient.setQueryData(
						authQueryKeys.session(),
						() => newSession,
					);
				},
			}}
		>
			{children}
		</SessionContext.Provider>
	);
}
