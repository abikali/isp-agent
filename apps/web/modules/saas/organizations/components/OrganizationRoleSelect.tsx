import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { ORGANIZATION_MEMBER_ROLES } from "../hooks/member-roles";
import { useOrganizationRolesQuery } from "../hooks/use-roles";

export function OrganizationRoleSelect({
	value,
	onSelect,
	disabled,
	organizationId,
}: {
	value: string;
	onSelect: (value: string) => void;
	disabled?: boolean;
	organizationId?: string;
}) {
	const { data: customRolesData } = useOrganizationRolesQuery(organizationId);

	const systemRoleOptions = Object.entries(ORGANIZATION_MEMBER_ROLES).map(
		([value, label]) => ({
			value,
			label,
		}),
	);

	const customRoleOptions: { value: string; label: string }[] =
		customRolesData?.roles?.map((r) => ({
			value: r.role,
			label: r.role,
		})) ?? [];

	const hasCustomRoles = customRoleOptions.length > 0;
	const showGroups = !!organizationId;

	return (
		<Select
			value={value}
			onValueChange={onSelect}
			disabled={disabled ?? false}
		>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{showGroups ? (
					<>
						<SelectGroup>
							<SelectLabel>System Roles</SelectLabel>
							{systemRoleOptions.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectGroup>
						{hasCustomRoles && (
							<>
								<SelectSeparator />
								<SelectGroup>
									<SelectLabel>Custom Roles</SelectLabel>
									{customRoleOptions.map((option) => (
										<SelectItem
											key={option.value}
											value={option.value}
										>
											{option.label}
										</SelectItem>
									))}
								</SelectGroup>
							</>
						)}
					</>
				) : (
					systemRoleOptions.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))
				)}
			</SelectContent>
		</Select>
	);
}
