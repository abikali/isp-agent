"use client";

import { Button } from "@ui/components/button";
import { CheckIcon, Loader2Icon, PlugZapIcon } from "lucide-react";
import { toast } from "sonner";
import { useTestAgentApiKey } from "../hooks/use-agents";
import type { LlmProvider } from "../lib/constants";

/** Tries the typed key (or the saved one) with a tiny generation. */
export function ApiKeyTestButton({
	agentId,
	organizationId,
	provider,
	model,
	apiKey,
	disabled,
}: {
	agentId: string;
	organizationId: string;
	provider: LlmProvider;
	model: string;
	apiKey: string;
	disabled: boolean;
}) {
	const test = useTestAgentApiKey();

	async function handleTest() {
		try {
			const result = await test.mutateAsync({
				agentId,
				organizationId,
				provider,
				model,
				...(apiKey ? { apiKey } : {}),
			});
			if (result.ok) {
				toast.success(`Key works (${result.latencyMs} ms)`);
			} else {
				toast.error(result.error);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Test failed");
		}
	}

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="h-7 shrink-0"
			disabled={disabled || test.isPending}
			onClick={handleTest}
		>
			{test.isPending ? (
				<Loader2Icon className="size-3.5 animate-spin" />
			) : test.data?.ok ? (
				<CheckIcon className="size-3.5" />
			) : (
				<PlugZapIcon className="size-3.5" />
			)}
			Test key
		</Button>
	);
}
