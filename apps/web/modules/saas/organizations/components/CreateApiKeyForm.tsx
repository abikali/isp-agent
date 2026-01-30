"use client";

import { nameSchema } from "@repo/api/lib/validation";
import { SettingsItem } from "@saas/shared/client";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useActiveOrganization } from "../hooks/use-active-organization";

type Permission =
	| "*"
	| "read:*"
	| "write:*"
	| "read:users"
	| "read:members"
	| "read:organization"
	| "write:members"
	| "write:organization";

const permissionOptions: { value: Permission; labelKey: string }[] = [
	{ value: "*", labelKey: "all" },
	{ value: "read:*", labelKey: "readAll" },
	{ value: "write:*", labelKey: "writeAll" },
	{ value: "read:users", labelKey: "readUsers" },
	{ value: "read:members", labelKey: "readMembers" },
	{ value: "read:organization", labelKey: "readOrganization" },
	{ value: "write:members", labelKey: "writeMembers" },
	{ value: "write:organization", labelKey: "writeOrganization" },
];

export function CreateApiKeyForm() {
	const queryClient = useQueryClient();
	const { activeOrganization } = useActiveOrganization();
	const [newKey, setNewKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const createMutation = useMutation(orpc.apiKeys.create.mutationOptions());

	const form = useForm({
		defaultValues: {
			name: "",
			permission: "*" as Permission,
		},
		onSubmit: async ({ value }) => {
			if (!activeOrganization) {
				return;
			}

			try {
				const result = await createMutation.mutateAsync({
					organizationId: activeOrganization.id,
					name: value.name,
					permissions: [value.permission],
				});

				setNewKey(result.key);
				form.reset();
				queryClient.invalidateQueries({
					queryKey: orpc.apiKeys.list.key(),
				});
				toast.success("API key created successfully");
			} catch {
				toast.error("Failed to create API key");
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const isValid = useStore(form.store, (state) => state.isValid);

	const copyKey = async () => {
		if (newKey) {
			await navigator.clipboard.writeText(newKey);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	if (!activeOrganization) {
		return null;
	}

	return (
		<SettingsItem
			title="Create API Key"
			description="Generate API keys to authenticate requests to the LibanCom API."
		>
			{newKey ? (
				<div className="space-y-4">
					<div className="rounded-md border border-border bg-muted/50 p-4">
						<p className="mb-2 text-sm text-muted-foreground">
							Save this API key securely. You won't be able to see
							it again.
						</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 break-all rounded bg-background p-2 font-mono text-sm">
								{newKey}
							</code>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={copyKey}
							>
								{copied ? (
									<CheckIcon className="size-4" />
								) : (
									<CopyIcon className="size-4" />
								)}
							</Button>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={() => setNewKey(null)}
					>
						Create another key
					</Button>
				</div>
			) : (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field
						name="name"
						validators={{
							onBlur: nameSchema,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="name">Name</FieldLabel>
									<Input
										id="name"
										placeholder="Production API Key"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										aria-invalid={hasErrors || undefined}
									/>
									{hasErrors && (
										<FieldError
											errors={field.state.meta.errors}
										/>
									)}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="permission">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="permission">Permissions</Label>
								<Select
									value={field.state.value}
									onValueChange={(value) =>
										field.handleChange(value as Permission)
									}
								>
									<SelectTrigger id="permission">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{permissionOptions.map((option) => (
											<SelectItem
												key={option.value}
												value={option.value}
											>
												{option.labelKey === "all"
													? "All Permissions"
													: option.labelKey ===
															"readAll"
														? "Read All"
														: option.labelKey ===
																"writeAll"
															? "Write All"
															: option.labelKey ===
																	"readUsers"
																? "Read Users"
																: option.labelKey ===
																		"readMembers"
																	? "Read Members"
																	: option.labelKey ===
																			"readOrganization"
																		? "Read Organization"
																		: option.labelKey ===
																				"writeMembers"
																			? "Write Members"
																			: "Write Organization"}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</form.Field>

					<div className="flex justify-end">
						<Button
							type="submit"
							disabled={!isValid}
							loading={isSubmitting}
						>
							Create API Key
						</Button>
					</div>
				</form>
			)}
		</SettingsItem>
	);
}
