"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { DownloadIcon } from "lucide-react";
import { useBulkExport } from "../hooks/use-customers";
import { downloadCsv } from "../lib/csv-utils";

interface BulkExportButtonProps {
	filters?: {
		status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING" | undefined;
		planId?: string | undefined;
		stationId?: string | undefined;
	};
}

export function BulkExportButton({ filters }: BulkExportButtonProps) {
	const organizationId = useOrganizationId();
	const bulkExport = useBulkExport();

	async function handleExport() {
		if (!organizationId) {
			return;
		}

		const result = await bulkExport.mutateAsync({
			organizationId,
			filters,
		});

		const date = new Date().toISOString().slice(0, 10);
		downloadCsv(result.csv, `customers-export-${date}.csv`);
	}

	return (
		<Button
			variant="outline"
			onClick={handleExport}
			disabled={bulkExport.isPending}
		>
			<DownloadIcon className="mr-2 size-4" />
			{bulkExport.isPending ? "Exporting..." : "Export"}
		</Button>
	);
}
