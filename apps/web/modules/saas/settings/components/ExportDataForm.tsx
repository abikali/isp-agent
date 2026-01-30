"use client";

import { SettingsItem } from "@saas/shared/client";
import { orpc } from "@shared/lib/orpc";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";

export function ExportDataForm() {
	const exportMutation = useMutation(orpc.users.exportData.mutationOptions());

	const handleExport = async () => {
		try {
			const data = await exportMutation.mutateAsync({});

			// Create a downloadable JSON file
			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `user-data-export-${new Date().toISOString().split("T")[0]}.json`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			toast.success("Data exported successfully");
		} catch {
			toast.error("Failed to export data");
		}
	};

	return (
		<SettingsItem
			title="Export Your Data"
			description="Download a copy of all your data in JSON format"
		>
			<div className="flex justify-end">
				<Button
					onClick={handleExport}
					disabled={exportMutation.isPending}
					loading={exportMutation.isPending}
				>
					<DownloadIcon className="mr-2 size-4" />
					Export Data
				</Button>
			</div>
		</SettingsItem>
	);
}
