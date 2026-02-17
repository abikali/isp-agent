"use client";

import type { ActiveOrganization, Session } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { isOrganizationAdmin } from "@repo/auth/lib/helper";
import { config } from "@repo/config";
import { useSession } from "@saas/auth/client";
import { authQueryKeys } from "@saas/auth/lib/api";
import {
	fullOrganizationQueryOptions,
	organizationsQueryKeys,
	useActiveOrganizationQuery,
} from "@saas/organizations/lib/api";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { ActiveOrganizationContext } from "../lib/active-organization-context";

export function ActiveOrganizationProvider({
	children,
}: {
	children: ReactNode;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { session, user } = useSession();
	const params = useParams({ strict: false });

	const activeOrganizationSlug =
		(params as { organizationSlug?: string }).organizationSlug ?? "";

	// Primary query: fetch by slug from URL params
	const { data: activeOrganizationBySlug } = useActiveOrganizationQuery(
		activeOrganizationSlug,
		{
			enabled: !!activeOrganizationSlug,
		},
	);

	// Fallback query: fetch by session.activeOrganizationId when no slug in URL
	// This preserves org context on pages like Account settings that don't have $organizationSlug
	const { data: activeOrganizationById } = useQuery({
		...fullOrganizationQueryOptions(session?.activeOrganizationId ?? ""),
		enabled: !activeOrganizationSlug && !!session?.activeOrganizationId,
	});

	// Use slug-based data when available, otherwise fall back to ID-based data
	const activeOrganizationData = activeOrganizationSlug
		? activeOrganizationBySlug
		: activeOrganizationById;

	// Cast to ActiveOrganization type - the query returns a compatible shape
	const activeOrganization = activeOrganizationData as
		| ActiveOrganization
		| null
		| undefined;

	const refetchActiveOrganization = async () => {
		if (activeOrganizationSlug) {
			await queryClient.refetchQueries({
				queryKey: organizationsQueryKeys.active(activeOrganizationSlug),
			});
		} else if (session?.activeOrganizationId) {
			await queryClient.refetchQueries({
				queryKey: organizationsQueryKeys.detail(
					session.activeOrganizationId,
				),
			});
		}
	};

	const setActiveOrganization = async (organizationSlug: string | null) => {
		const { default: nProgress } = await import("nprogress");
		nProgress.start();

		try {
			// If clearing organization, pass null directly
			if (!organizationSlug) {
				const { error } = await authClient.organization.setActive({
					organizationId: null,
				});
				if (error) {
					throw new Error(
						error.message || "Failed to clear active organization",
					);
				}

				// Clear activeOrganizationId from local session cache
				queryClient.setQueryData(
					authQueryKeys.session(),
					(sessionData: Session | undefined) => {
						if (!sessionData) {
							return sessionData;
						}
						return {
							...sessionData,
							session: {
								...sessionData.session,
								activeOrganizationId: null,
							},
						};
					},
				);

				router.push("/app");
				return;
			}

			// Look up the organization ID from the slug first
			const { data: orgData, error: orgError } =
				await authClient.organization.getFullOrganization({
					query: { organizationSlug },
				});

			if (orgError || !orgData) {
				throw new Error(orgError?.message || "Organization not found");
			}

			// Now set active using the actual organization ID
			const { data, error } = await authClient.organization.setActive({
				organizationId: orgData.id,
			});

			if (error) {
				throw new Error(
					error.message || "Failed to set active organization",
				);
			}

			// Cast the response to expected organization shape
			const newActiveOrganization = data as
				| { id: string; slug: string }
				| null
				| undefined;

			if (!newActiveOrganization) {
				return;
			}

			// Pre-populate cache for the new org (we already have the data from getFullOrganization)
			queryClient.setQueryData(
				organizationsQueryKeys.active(orgData.slug),
				orgData,
			);

			if (config.organizations.enableBilling) {
				await queryClient.prefetchQuery(
					orpc.payments.listPurchases.queryOptions({
						input: {
							organizationId: newActiveOrganization.id,
						},
					}),
				);
			}

			queryClient.setQueryData(
				authQueryKeys.session(),
				(sessionData: Session | undefined) => {
					if (!sessionData) {
						return sessionData;
					}
					return {
						...sessionData,
						session: {
							...sessionData.session,
							activeOrganizationId: newActiveOrganization.id,
						},
					};
				},
			);

			router.push(`/app/${newActiveOrganization.slug}`);
		} finally {
			nProgress.done();
		}
	};

	const [loaded, setLoaded] = useState(activeOrganization !== undefined);

	useEffect(() => {
		if (!loaded && activeOrganization !== undefined) {
			setLoaded(true);
		}
	}, [activeOrganization, loaded]);

	const activeOrganizationUserRole = activeOrganization?.members.find(
		(member) => member.userId === session?.userId,
	)?.role;

	return (
		<ActiveOrganizationContext.Provider
			value={{
				loaded,
				activeOrganization: activeOrganization ?? null,
				activeOrganizationUserRole: activeOrganizationUserRole ?? null,
				isOrganizationAdmin:
					!!activeOrganization &&
					!!user &&
					isOrganizationAdmin(activeOrganization, user),
				setActiveOrganization,
				refetchActiveOrganization,
			}}
		>
			{children}
		</ActiveOrganizationContext.Provider>
	);
}
