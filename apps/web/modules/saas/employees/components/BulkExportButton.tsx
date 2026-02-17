"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { DownloadIcon } from "lucide-react";
import { useEmployeeBulkExport } from "../hooks/use-employees";
import { downloadCsv } from "../lib/csv-utils";

interface BulkExportButtonProps {
	filters?: {
		status?: string | undefined;
		department?: string | undefined;
		stationId?: string | undefined;
	};
}

export function BulkExportButton({ filters }: BulkExportButtonProps) {
	const organizationId = useOrganizationId();
	const bulkExport = useEmployeeBulkExport();

	async function handleExport() {
		if (!organizationId) {
			return;
		}
		const filtersInput: Record<string, unknown> = {};
		if (filters?.status) {
			filtersInput["status"] = filters.status;
		}
		if (filters?.department) {
			filtersInput["department"] = filters.department;
		}
		if (filters?.stationId) {
			filtersInput["stationId"] = filters.stationId;
		}

		const result = await bulkExport.mutateAsync({
			organizationId,
			filters:
				Object.keys(filtersInput).length > 0
					? (filtersInput as Parameters<
							typeof bulkExport.mutateAsync
						>[0]["filters"])
					: undefined,
		});

		const date = new Date().toISOString().split("T")[0];
		downloadCsv(result.csv, `employees-${date}.csv`);
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
