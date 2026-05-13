"use client";

import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { formatDateTime } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import {
	useDeleteIntegration,
	useIntegration,
	useTestConnection,
	useUpsertIntegration,
} from "../hooks/use-marketing";

export function MarketingSettingsForm() {
	const organizationId = useOrganizationId();
	const { integration, isConfigured, isLoading, refetch } = useIntegration();

	const upsert = useUpsertIntegration();
	const test = useTestConnection();
	const remove = useDeleteIntegration();

	const [endpoint, setEndpoint] = useState("https://saltimarketing.com/");
	const [token, setToken] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	if (isLoading) {
		return null;
	}

	const onSave = async () => {
		if (!organizationId) {
			return;
		}
		setFormError(null);
		if (!token.trim()) {
			setFormError("API token is required.");
			return;
		}
		try {
			await upsert.mutateAsync({
				organizationId,
				apiEndpoint: endpoint.trim() || "https://saltimarketing.com/",
				apiToken: token.trim(),
			});
			setToken("");
			await refetch();
		} catch (err) {
			setFormError(err instanceof Error ? err.message : "Save failed");
		}
	};

	const onTest = async () => {
		if (!organizationId) {
			return;
		}
		try {
			await test.mutateAsync({ organizationId });
			await refetch();
		} catch {
			await refetch();
		}
	};

	const onDisconnect = async () => {
		if (!organizationId) {
			return;
		}
		await remove.mutateAsync({ organizationId });
		setToken("");
		await refetch();
	};

	return (
		<SettingsItem
			title="Salti Marketing"
			description="WhatsApp Business credentials for marketing broadcasts. Generate an API token from your Salti dashboard."
		>
			<div className="flex flex-col gap-4">
				{isConfigured && integration ? (
					<Alert>
						<CheckCircle2Icon className="size-4" />
						<AlertTitle>Connected</AlertTitle>
						<AlertDescription>
							Endpoint:{" "}
							<code className="text-xs">
								{integration.apiEndpoint}
							</code>
							<br />
							Last tested:{" "}
							{integration.lastTestedAt
								? formatDateTime(integration.lastTestedAt)
								: "never"}
							{integration.lastTestStatus &&
							integration.lastTestStatus !== "success" ? (
								<>
									<br />
									<span className="text-destructive">
										{integration.lastTestStatus}
									</span>
								</>
							) : null}
						</AlertDescription>
					</Alert>
				) : (
					<Alert variant="default">
						<TriangleAlertIcon className="size-4" />
						<AlertTitle>Not configured</AlertTitle>
						<AlertDescription>
							Paste your Salti API token below to enable WhatsApp
							marketing broadcasts.
						</AlertDescription>
					</Alert>
				)}

				<Field>
					<FieldLabel htmlFor="salti-endpoint">
						API endpoint
					</FieldLabel>
					<Input
						id="salti-endpoint"
						value={endpoint}
						onChange={(e) => setEndpoint(e.target.value)}
						placeholder="https://saltimarketing.com/"
					/>
				</Field>

				<Field data-invalid={formError ? true : undefined}>
					<FieldLabel htmlFor="salti-token">
						API token{" "}
						{isConfigured ? "(leave blank to keep current)" : "*"}
					</FieldLabel>
					<Input
						id="salti-token"
						type="password"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder={
							isConfigured ? "••••••••••••••••" : "Paste token"
						}
						autoComplete="off"
					/>
					{formError ? <FieldError errors={[formError]} /> : null}
				</Field>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						onClick={onSave}
						disabled={upsert.isPending || !token.trim()}
					>
						{upsert.isPending
							? "Saving…"
							: isConfigured
								? "Update token"
								: "Save"}
					</Button>
					{isConfigured ? (
						<>
							<Button
								variant="outline"
								onClick={onTest}
								disabled={test.isPending}
							>
								{test.isPending
									? "Testing…"
									: "Test connection"}
							</Button>
							<Button
								variant="destructive"
								onClick={onDisconnect}
								disabled={remove.isPending}
							>
								{remove.isPending ? "Removing…" : "Disconnect"}
							</Button>
						</>
					) : null}
				</div>
			</div>
		</SettingsItem>
	);
}
