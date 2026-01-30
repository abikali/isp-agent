"use client";

import { SettingsItem } from "@saas/shared/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Suspense, useState } from "react";
import { CreateRoleForm } from "./CreateRoleForm";
import { EditRoleDialog } from "./EditRoleDialog";
import { RolesList, RolesListSkeleton } from "./RolesList";

interface RolesBlockProps {
	organizationId: string;
}

export function RolesBlock({ organizationId }: RolesBlockProps) {
	const [activeTab, setActiveTab] = useState("list");
	const [editingRole, setEditingRole] = useState<{
		id: string;
		name: string;
		permissions: string;
	} | null>(null);

	return (
		<>
			<SettingsItem
				title="Roles"
				description="Manage roles and permissions for your organization"
			>
				<Tabs value={activeTab} onValueChange={setActiveTab}>
					<TabsList className="mb-4">
						<TabsTrigger value="list">Roles</TabsTrigger>
						<TabsTrigger value="create">Create Role</TabsTrigger>
					</TabsList>
					<TabsContent value="list">
						<Suspense fallback={<RolesListSkeleton />}>
							<RolesList
								organizationId={organizationId}
								onEditRole={setEditingRole}
							/>
						</Suspense>
					</TabsContent>
					<TabsContent value="create">
						<CreateRoleForm
							organizationId={organizationId}
							onSuccess={() => setActiveTab("list")}
						/>
					</TabsContent>
				</Tabs>
			</SettingsItem>

			<EditRoleDialog
				organizationId={organizationId}
				role={editingRole}
				open={!!editingRole}
				onOpenChange={(open) => !open && setEditingRole(null)}
			/>
		</>
	);
}
