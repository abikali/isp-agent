"use client";

import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import {
	AlertCircleIcon,
	CheckCircle2Icon,
	DownloadIcon,
	UploadIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useEmployeeBulkImport } from "../hooks/use-employees";
import type { EmployeeCsvRow } from "../lib/csv-utils";
import {
	downloadCsv,
	generateEmployeeCsvTemplate,
	parseEmployeeCsv,
} from "../lib/csv-utils";

type Step = "upload" | "preview" | "importing" | "complete";

export function BulkImportDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const bulkImport = useEmployeeBulkImport();
	const [step, setStep] = useState<Step>("upload");
	const [rows, setRows] = useState<EmployeeCsvRow[]>([]);
	const [parseErrors, setParseErrors] = useState<string[]>([]);
	const [result, setResult] = useState<{
		successCount: number;
		errorCount: number;
		errors: Array<{ row: number; error: string }>;
	} | null>(null);

	const reset = useCallback(() => {
		setTimeout(() => {
			setStep("upload");
			setRows([]);
			setParseErrors([]);
			setResult(null);
		}, 200);
	}, []);

	function handleClose(isOpen: boolean) {
		if (!isOpen) {
			reset();
		}
		onOpenChange(isOpen);
	}

	function handleFileSelect(file: File) {
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			const parsed = parseEmployeeCsv(text);
			setRows(parsed.rows);
			setParseErrors(parsed.errors);
			setStep("preview");
		};
		reader.readAsText(file);
	}

	async function handleImport() {
		setStep("importing");
		try {
			const res = await bulkImport.mutateAsync({
				organizationId: "",
				rows,
			});
			setResult({
				successCount: res.successCount,
				errorCount: res.errorCount,
				errors: res.errors,
			});
			setStep("complete");
		} catch {
			setStep("preview");
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Import Employees</DialogTitle>
				</DialogHeader>

				{step === "upload" && (
					<div className="space-y-4">
						<button
							type="button"
							className="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-transparent p-8 text-center"
							onDragOver={(e) => e.preventDefault()}
							onDrop={(e) => {
								e.preventDefault();
								const file = e.dataTransfer.files[0];
								if (file) {
									handleFileSelect(file);
								}
							}}
							onClick={() => {
								const input =
									document.querySelector<HTMLInputElement>(
										"input[type='file']",
									);
								input?.click();
							}}
						>
							<UploadIcon className="mb-2 size-8 text-muted-foreground" />
							<p className="mb-1 text-sm font-medium">
								Drag & drop a CSV file here
							</p>
							<p className="mb-3 text-xs text-muted-foreground">
								or click to select a file
							</p>
							<input
								type="file"
								accept=".csv"
								className="hidden"
								id="emp-csv-upload"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) {
										handleFileSelect(file);
									}
								}}
							/>
							<span className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium">
								Select File
							</span>
						</button>
						<Button
							variant="ghost"
							size="sm"
							className="w-full"
							onClick={() =>
								downloadCsv(
									generateEmployeeCsvTemplate(),
									"employee-import-template.csv",
								)
							}
						>
							<DownloadIcon className="mr-2 size-4" />
							Download Template
						</Button>
					</div>
				)}

				{step === "preview" && (
					<div className="space-y-4">
						{parseErrors.length > 0 && (
							<div className="rounded-md bg-destructive/10 p-3">
								<div className="flex items-center gap-2 text-sm font-medium text-destructive">
									<AlertCircleIcon className="size-4" />
									{parseErrors.length} error(s) found
								</div>
								<ul className="mt-1 text-xs text-destructive">
									{parseErrors.slice(0, 5).map((err) => (
										<li key={err}>{err}</li>
									))}
								</ul>
							</div>
						)}
						<p className="text-sm text-muted-foreground">
							{rows.length} employee(s) ready to import
						</p>
						{rows.length > 0 && (
							<div className="max-h-60 overflow-auto rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Email</TableHead>
											<TableHead>Phone</TableHead>
											<TableHead>Department</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{rows.slice(0, 20).map((row, i) => (
											<TableRow
												key={`preview-${row.name}-${i}`}
											>
												<TableCell className="text-xs">
													{row.name}
												</TableCell>
												<TableCell className="text-xs">
													{row.email ?? "-"}
												</TableCell>
												<TableCell className="text-xs">
													{row.phone ?? "-"}
												</TableCell>
												<TableCell className="text-xs">
													{row.department ?? "-"}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setStep("upload")}
							>
								Back
							</Button>
							<Button
								onClick={handleImport}
								disabled={rows.length === 0}
							>
								Import {rows.length} Employee(s)
							</Button>
						</DialogFooter>
					</div>
				)}

				{step === "importing" && (
					<div className="flex flex-col items-center justify-center py-8">
						<div className="mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
						<p className="text-sm text-muted-foreground">
							Importing employees...
						</p>
					</div>
				)}

				{step === "complete" && result && (
					<div className="space-y-4">
						<div className="flex flex-col items-center py-4">
							<CheckCircle2Icon className="mb-2 size-10 text-green-500" />
							<p className="text-lg font-medium">
								Import Complete
							</p>
							<p className="text-sm text-muted-foreground">
								{result.successCount} imported,{" "}
								{result.errorCount} failed
							</p>
						</div>
						{result.errors.length > 0 && (
							<div className="rounded-md bg-destructive/10 p-3">
								<p className="text-sm font-medium text-destructive">
									Errors:
								</p>
								<ul className="mt-1 text-xs text-destructive">
									{result.errors.slice(0, 10).map((err) => (
										<li key={`err-${err.row}`}>
											Row {err.row}: {err.error}
										</li>
									))}
								</ul>
							</div>
						)}
						<DialogFooter>
							<Button onClick={() => handleClose(false)}>
								Done
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
