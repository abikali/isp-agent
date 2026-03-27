"use client";

import type { ActiveOrganization } from "@repo/auth";
import type { PermissionResource } from "@repo/auth/permissions";
import React from "react";

export interface EmployeeIdentity {
	id: string;
	name: string;
	employeeNumber: string;
	position: string | null;
	department: string | null;
	email: string | null;
	phone: string | null;
	preferredLayout: string;
}

export interface DealerIdentity {
	id: string;
	name: string;
	username: string | null;
	email: string | null;
	phone: string | null;
	credit: number;
	commission: number;
}

export const ActiveOrganizationContext = React.createContext<
	| {
			activeOrganization: ActiveOrganization | null;
			activeOrganizationUserRole:
				| ActiveOrganization["members"][number]["role"]
				| null;
			isOrganizationAdmin: boolean;
			permissions: Partial<Record<PermissionResource, string[]>>;
			employee: EmployeeIdentity | null;
			dealer: DealerIdentity | null;
			loaded: boolean;
			setActiveOrganization: (
				organizationId: string | null,
			) => Promise<void>;
			refetchActiveOrganization: () => Promise<void>;
	  }
	| undefined
>(undefined);
