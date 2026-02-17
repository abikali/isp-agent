"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { useUpdateToolConfig } from "../hooks/use-tools";

interface ConfigField {
	key: string;
	label: string;
	type: "text" | "password" | "select";
	required: boolean;
	placeholder?: string | undefined;
	defaultValue?: string | undefined;
	options?: Array<{ label: string; value: string }> | undefined;
}

interface ToolConfigDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	agentId: string;
	organizationId: string;
	toolId: string;
	toolName: string;
	configFields: ConfigField[];
	existingConfig?: Record<string, unknown> | undefined;
}

export function ToolConfigDialog({
	open,
	onOpenChange,
	agentId,
	organizationId,
	toolId,
	toolName,
	configFields,
	existingConfig,
}: ToolConfigDialogProps) {
	const updateToolConfig = useUpdateToolConfig();

	const defaultValues: Record<string, string> = {};
	for (const field of configFields) {
		defaultValues[field.key] =
			(existingConfig?.[field.key] as string) ?? field.defaultValue ?? "";
	}

	const form = useForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			const config: Record<string, unknown> = {};
			for (const field of configFields) {
				if (value[field.key]) {
					config[field.key] = value[field.key];
				}
			}

			await updateToolConfig.mutateAsync({
				agentId,
				organizationId,
				toolId,
				config,
			});
			onOpenChange(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Configure {toolName}</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					{configFields.map((field) => (
						<form.Field key={field.key} name={field.key}>
							{(formField) => (
								<Field>
									<FieldLabel htmlFor={`config-${field.key}`}>
										{field.label}
										{field.required ? " *" : ""}
									</FieldLabel>
									{field.type === "select" &&
									field.options ? (
										<Select
											value={formField.state.value}
											onValueChange={
												formField.handleChange
											}
										>
											<SelectTrigger
												id={`config-${field.key}`}
											>
												<SelectValue
													placeholder={
														field.placeholder ??
														"Select..."
													}
												/>
											</SelectTrigger>
											<SelectContent>
												{field.options.map((opt) => (
													<SelectItem
														key={opt.value}
														value={opt.value}
													>
														{opt.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : (
										<Input
											id={`config-${field.key}`}
											type={
												field.type === "password"
													? "password"
													: "text"
											}
											value={formField.state.value}
											onChange={(e) =>
												formField.handleChange(
													e.target.value,
												)
											}
											onBlur={formField.handleBlur}
											placeholder={
												field.placeholder ?? ""
											}
										/>
									)}
								</Field>
							)}
						</form.Field>
					))}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Saving..." : "Save Configuration"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
