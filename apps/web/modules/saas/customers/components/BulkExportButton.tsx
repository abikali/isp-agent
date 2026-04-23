"use client";

import type { CustomerExportStatus } from "@repo/api/modules/customers/lib/statuses";
import { formatDateInput } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { DownloadIcon } from "lucide-react";
import { useBulkExport } from "../hooks/use-customers";
import { downloadCsv } from "../lib/csv-utils";

interface BulkExportButtonProps {
	filters?: {
		status?: CustomerExportStatus | undefined;
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

		downloadCsv(result.csv, `customers-export-${formatDateInput()}.csv`);
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
