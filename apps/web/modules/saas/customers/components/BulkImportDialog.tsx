"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { ScrollArea } from "@ui/components/scroll-area";
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
	FileSpreadsheetIcon,
	LoaderIcon,
	UploadIcon,
	XCircleIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useBulkImport } from "../hooks/use-customers";
import type { CsvRow, ParseResult } from "../lib/csv-utils";
import { downloadCsv, generateCsvTemplate, parseCsv } from "../lib/csv-utils";

type Step = "upload" | "preview" | "importing" | "complete";

interface ImportResult {
	successCount: number;
	errorCount: number;
	errors: Array<{ row: number; error: string }>;
	total: number;
}

export function BulkImportDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const bulkImport = useBulkImport();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [step, setStep] = useState<Step>("upload");
	const [fileName, setFileName] = useState("");
	const [parseResult, setParseResult] = useState<ParseResult>({
		rows: [],
		errors: [],
	});
	const [importResult, setImportResult] = useState<ImportResult | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);

	function resetState() {
		setStep("upload");
		setFileName("");
		setParseResult({ rows: [], errors: [] });
		setImportResult(null);
		setIsDragOver(false);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	}

	function handleClose() {
		onOpenChange(false);
		// Delay reset so dialog close animation plays with current content
		setTimeout(resetState, 200);
	}

	function processFile(file: File) {
		if (!file.name.endsWith(".csv")) {
			setParseResult({
				rows: [],
				errors: [{ row: 0, error: "Please select a CSV file" }],
			});
			setStep("preview");
			return;
		}

		setFileName(file.name);
		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			const result = parseCsv(text);
			setParseResult(result);
			setStep("preview");
		};
		reader.onerror = () => {
			setParseResult({
				rows: [],
				errors: [
					{ row: 0, error: "Failed to read file. Please try again." },
				],
			});
			setStep("preview");
		};
		reader.readAsText(file);
	}

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) {
			processFile(file);
		}
		// Reset the input so the same file can be re-selected
		if (e.target) {
			e.target.value = "";
		}
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setIsDragOver(false);
		const file = e.dataTransfer.files[0];
		if (file) {
			processFile(file);
		}
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		setIsDragOver(true);
	}

	function handleDragLeave(e: React.DragEvent) {
		e.preventDefault();
		setIsDragOver(false);
	}

	async function handleImport() {
		if (!organizationId || parseResult.rows.length === 0) {
			return;
		}

		setStep("importing");
		try {
			const result = await bulkImport.mutateAsync({
				organizationId,
				rows: parseResult.rows,
			});
			setImportResult(result);
			setStep("complete");
		} catch {
			setImportResult({
				successCount: 0,
				errorCount: parseResult.rows.length,
				errors: [{ row: 0, error: "Import failed. Please try again." }],
				total: parseResult.rows.length,
			});
			setStep("complete");
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Import Customers from CSV</DialogTitle>
					<DialogDescription>
						{step === "upload" &&
							"Upload a CSV file to bulk import customers."}
						{step === "preview" &&
							"Review the parsed data before importing."}
						{step === "importing" && "Importing customers..."}
						{step === "complete" && "Import finished."}
					</DialogDescription>
				</DialogHeader>

				{step === "upload" && <UploadStep />}
				{step === "preview" && <PreviewStep />}
				{step === "importing" && <ImportingStep />}
				{step === "complete" && <CompleteStep />}

				<DialogFooter>
					{step === "upload" && (
						<Button variant="outline" onClick={handleClose}>
							Cancel
						</Button>
					)}

					{step === "preview" && (
						<>
							<Button variant="outline" onClick={resetState}>
								Back
							</Button>
							<Button
								onClick={handleImport}
								disabled={parseResult.rows.length === 0}
							>
								Import {parseResult.rows.length} Customer
								{parseResult.rows.length !== 1 ? "s" : ""}
							</Button>
						</>
					)}

					{step === "complete" && (
						<>
							<Button variant="outline" onClick={resetState}>
								Import More
							</Button>
							<Button onClick={handleClose}>Done</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);

	function UploadStep() {
		return (
			<div className="space-y-4">
				<button
					type="button"
					className={`flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-transparent p-8 transition-colors ${
						isDragOver
							? "border-primary bg-primary/5"
							: "border-border hover:border-primary/50"
					}`}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onClick={() => fileInputRef.current?.click()}
				>
					<UploadIcon className="size-10 text-muted-foreground" />
					<div className="text-center">
						<p className="text-sm font-medium">
							Drop your CSV file here or click to browse
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Supports .csv files up to 1,000 rows
						</p>
					</div>
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv"
						className="hidden"
						onChange={handleFileChange}
					/>
				</button>

				<Button
					variant="outline"
					size="sm"
					className="w-full"
					onClick={() =>
						downloadCsv(
							generateCsvTemplate(),
							"customers-template.csv",
						)
					}
				>
					<DownloadIcon className="mr-2 size-4" />
					Download CSV Template
				</Button>
			</div>
		);
	}

	function PreviewStep() {
		const { rows, errors } = parseResult;
		const hasRows = rows.length > 0;

		return (
			<div className="space-y-4">
				{/* File info */}
				<div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
					<FileSpreadsheetIcon className="size-4 text-muted-foreground" />
					<span className="text-sm font-medium">{fileName}</span>
					<span className="text-xs text-muted-foreground">
						({rows.length} valid row
						{rows.length !== 1 ? "s" : ""})
					</span>
				</div>

				{/* Parse errors */}
				{errors.length > 0 && (
					<Alert variant="error">
						<AlertCircleIcon />
						<AlertTitle>
							{errors.length} row{errors.length !== 1 ? "s" : ""}{" "}
							skipped
						</AlertTitle>
						<AlertDescription>
							<ScrollArea className="max-h-24">
								<ul className="mt-1 space-y-0.5 text-xs">
									{errors.map((err) => (
										<li key={`err-${err.row}`}>
											{err.row > 0 && (
												<span className="font-medium">
													Row {err.row}:{" "}
												</span>
											)}
											{err.error}
										</li>
									))}
								</ul>
							</ScrollArea>
						</AlertDescription>
					</Alert>
				)}

				{/* No valid rows */}
				{!hasRows && errors.length > 0 && (
					<Alert variant="error">
						<XCircleIcon />
						<AlertTitle>No valid rows to import</AlertTitle>
						<AlertDescription>
							Fix the errors above and try again, or download the
							template for the expected format.
						</AlertDescription>
					</Alert>
				)}

				{/* Data preview table */}
				{hasRows && (
					<ScrollArea className="max-h-64 rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-12">#</TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead className="hidden sm:table-cell">
										Phone
									</TableHead>
									<TableHead className="hidden md:table-cell">
										Plan
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Station
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.slice(0, 50).map((row, i) => (
									<PreviewRow
										key={`row-${row.fullName}-${i}`}
										row={row}
										index={i}
									/>
								))}
							</TableBody>
						</Table>
						{rows.length > 50 && (
							<p className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
								Showing first 50 of {rows.length} rows
							</p>
						)}
					</ScrollArea>
				)}
			</div>
		);
	}

	function ImportingStep() {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-8">
				<LoaderIcon className="size-8 animate-spin text-primary" />
				<p className="text-sm text-muted-foreground">
					Importing {parseResult.rows.length} customer
					{parseResult.rows.length !== 1 ? "s" : ""}...
				</p>
			</div>
		);
	}

	function CompleteStep() {
		if (!importResult) {
			return null;
		}

		const allSuccess = importResult.errorCount === 0;
		const allFailed = importResult.successCount === 0;

		return (
			<div className="space-y-4">
				{/* Summary */}
				<Alert variant={allFailed ? "error" : "success"}>
					{allFailed ? <XCircleIcon /> : <CheckCircle2Icon />}
					<AlertTitle>
						{allFailed
							? "Import failed"
							: allSuccess
								? "Import successful"
								: "Import completed with errors"}
					</AlertTitle>
					<AlertDescription>
						<div className="mt-1 flex gap-4 text-sm">
							{importResult.successCount > 0 && (
								<span>
									{importResult.successCount} imported
								</span>
							)}
							{importResult.errorCount > 0 && (
								<span>{importResult.errorCount} failed</span>
							)}
						</div>
					</AlertDescription>
				</Alert>

				{/* Error details */}
				{importResult.errors.length > 0 && (
					<ScrollArea className="max-h-32 rounded-md border p-3">
						<ul className="space-y-1 text-xs text-destructive">
							{importResult.errors.map((err) => (
								<li key={`import-err-${err.row}`}>
									{err.row > 0 && (
										<span className="font-medium">
											Row {err.row}:{" "}
										</span>
									)}
									{err.error}
								</li>
							))}
						</ul>
					</ScrollArea>
				)}
			</div>
		);
	}
}

function PreviewRow({ row, index }: { row: CsvRow; index: number }) {
	return (
		<TableRow>
			<TableCell className="font-mono text-xs text-muted-foreground">
				{index + 1}
			</TableCell>
			<TableCell className="font-medium">{row.fullName}</TableCell>
			<TableCell className="text-xs">
				{row.email ?? <span className="text-muted-foreground">-</span>}
			</TableCell>
			<TableCell className="hidden text-xs sm:table-cell">
				{row.phone ?? <span className="text-muted-foreground">-</span>}
			</TableCell>
			<TableCell className="hidden text-xs md:table-cell">
				{row.planName ?? (
					<span className="text-muted-foreground">-</span>
				)}
			</TableCell>
			<TableCell className="hidden text-xs lg:table-cell">
				{row.stationName ?? (
					<span className="text-muted-foreground">-</span>
				)}
			</TableCell>
		</TableRow>
	);
}
