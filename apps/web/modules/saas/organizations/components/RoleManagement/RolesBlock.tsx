"use client";

import { SettingsItem } from "@saas/shared/client";
import { Button } from "@ui/components/button";
import { PlusIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { CreateRoleDialog } from "./CreateRoleForm";
import { EditRoleDialog } from "./EditRoleDialog";
import { RolesList, RolesListSkeleton } from "./RolesList";

interface RolesBlockProps {
	organizationId: string;
}

export function RolesBlock({ organizationId }: RolesBlockProps) {
	const [showCreate, setShowCreate] = useState(false);
	const [editingRole, setEditingRole] = useState<{
		id: string;
		name: string;
		permissions: string;
	} | null>(null);

	return (
		<>
			<SettingsItem
				title={
					<div className="flex items-center justify-between">
						<span>Roles</span>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setShowCreate(true)}
							className="gap-1.5"
						>
							<PlusIcon className="size-3.5" />
							Create Role
						</Button>
					</div>
				}
				description="Define roles with granular permissions to control what each team member can access"
				fullWidth
			>
				<Suspense fallback={<RolesListSkeleton />}>
					<RolesList
						organizationId={organizationId}
						onEditRole={setEditingRole}
					/>
				</Suspense>
			</SettingsItem>

			<CreateRoleDialog
				organizationId={organizationId}
				open={showCreate}
				onOpenChange={setShowCreate}
			/>

			<EditRoleDialog
				organizationId={organizationId}
				role={editingRole}
				open={!!editingRole}
				onOpenChange={(open) => !open && setEditingRole(null)}
			/>
		</>
	);
}
