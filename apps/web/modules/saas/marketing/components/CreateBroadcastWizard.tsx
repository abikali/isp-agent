"use client";

import { CUSTOMER_LIST_STATUSES } from "@repo/api/modules/customers/lib/statuses";
import type { AudienceInput } from "@repo/api/modules/marketing/lib/audience";
import type { SaltiTemplate } from "@repo/integrations";
import { PageShell } from "@shared/components/PageShell";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Textarea } from "@ui/components/textarea";
import {
	CheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	LoaderIcon,
	TriangleAlertIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useIRadiusGroups } from "../../customers/hooks/use-customers";
import { CONNECTION_TYPE_OPTIONS } from "../../customers/lib/constants";
import {
	useAudiencePreviewQuery,
	useCreateBroadcast,
	useGroupsQuery,
	useTemplatesQuery,
} from "../hooks/use-marketing";
import {
	CUSTOMER_VARIABLE_FIELDS,
	getTemplatePlaceholderCounts,
	renderPlaceholderPreview,
} from "../lib/template-placeholders";

type AudienceTab = "isp_customers" | "salti_group" | "csv" | "manual";
type Step = "audience" | "template" | "variables" | "review";

interface VariableMapping {
	kind: "static" | "field";
	value?: string;
	field?: string;
}

type ConnectionType = "FIBER" | "WIRELESS" | "DSL" | "CABLE" | "ETHERNET";

interface CustomerFilters {
	status?: (typeof CUSTOMER_LIST_STATUSES)[number];
	planId?: string;
	stationId?: string;
	collectorId?: string;
	groupName?: string;
	connectionType?: ConnectionType;
	expiresWithinDays?: number;
	minBalance?: number;
}

interface CreateBroadcastWizardProps {
	organizationSlug: string;
}

export function CreateBroadcastWizard({
	organizationSlug,
}: CreateBroadcastWizardProps) {
	const organizationId = useOrganizationId();
	const navigate = useNavigate();
	const {
		templates,
		isLoading: templatesLoading,
		error: templatesError,
	} = useTemplatesQuery();
	const { groups } = useGroupsQuery();
	// iRadius UserGroup options for the ISP-customers filter. Auto-scoped to
	// the caller's active dealer by the procedure — pass no dealerId here.
	const { groups: iradiusGroups } = useIRadiusGroups();
	const create = useCreateBroadcast();

	const [step, setStep] = useState<Step>("audience");
	const [audienceTab, setAudienceTab] =
		useState<AudienceTab>("isp_customers");

	// audience configs
	const [customerFilters, setCustomerFilters] = useState<CustomerFilters>({});
	const [groupId, setGroupId] = useState<string>("");
	const [manualPhones, setManualPhones] = useState<string>("");
	const [csvText, setCsvText] = useState<string>("");

	// template
	const [templateName, setTemplateName] = useState<string>("");
	const [templateLang, setTemplateLang] = useState<string>("");
	const [broadcastName, setBroadcastName] = useState<string>("");

	// mapping per placeholder slot
	const [headerMappings, setHeaderMappings] = useState<VariableMapping[]>([]);
	const [bodyMappings, setBodyMappings] = useState<VariableMapping[]>([]);

	const selectedTemplate: SaltiTemplate | undefined = useMemo(
		() =>
			templates.find(
				(t) => t.name === templateName && t.language === templateLang,
			),
		[templates, templateName, templateLang],
	);

	const counts = useMemo(
		() =>
			selectedTemplate
				? getTemplatePlaceholderCounts(selectedTemplate)
				: { header: 0, body: 0, button: 0 },
		[selectedTemplate],
	);

	// Debounce text-heavy inputs so the live preview doesn't fire on every
	// keystroke. ISP filters + group/select changes are kept immediate.
	const [debouncedManualPhones] = useDebouncedValue(manualPhones, {
		wait: 300,
	});
	const [debouncedCsvText] = useDebouncedValue(csvText, { wait: 300 });

	const audienceInput = useMemo<AudienceInput>(() => {
		if (audienceTab === "isp_customers") {
			return {
				type: "isp_customers",
				...(customerFilters.status && {
					status: customerFilters.status,
				}),
				...(customerFilters.planId && {
					planId: customerFilters.planId,
				}),
				...(customerFilters.stationId && {
					stationId: customerFilters.stationId,
				}),
				...(customerFilters.collectorId && {
					collectorId: customerFilters.collectorId,
				}),
				...(customerFilters.groupName && {
					groupName: customerFilters.groupName,
				}),
				...(customerFilters.connectionType && {
					connectionType: customerFilters.connectionType,
				}),
				...(customerFilters.expiresWithinDays !== undefined && {
					expiresWithinDays: customerFilters.expiresWithinDays,
				}),
				...(customerFilters.minBalance !== undefined && {
					minBalance: customerFilters.minBalance,
				}),
			};
		}
		if (audienceTab === "salti_group") {
			const group = groups.find((g) => String(g.id) === groupId);
			return {
				type: "salti_group",
				groupId,
				...(group?.name && { groupName: group.name }),
			};
		}
		if (audienceTab === "manual") {
			return {
				type: "manual",
				phones: debouncedManualPhones
					.split(/[\s,;]+/)
					.map((s) => s.trim())
					.filter(Boolean),
			};
		}
		const lines = debouncedCsvText
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
		return {
			type: "csv",
			rows: lines.flatMap((l) => {
				const [phone, ...rest] = l.split(",").map((c) => c.trim());
				if (!phone) {
					return [];
				}
				return [{ phone, name: rest[0] ?? undefined, variables: {} }];
			}),
		};
	}, [
		audienceTab,
		customerFilters,
		groupId,
		debouncedManualPhones,
		debouncedCsvText,
		groups,
	]);

	// Only fire the preview when the audience has something to count.
	const previewEnabled = useMemo(() => {
		switch (audienceInput.type) {
			case "isp_customers":
				return true;
			case "salti_group":
				return audienceInput.groupId.length > 0;
			case "manual":
				return audienceInput.phones.length > 0;
			case "csv":
				return audienceInput.rows.length > 0;
		}
	}, [audienceInput]);

	const preview = useAudiencePreviewQuery(audienceInput, previewEnabled);

	const onSelectTemplate = (template: SaltiTemplate) => {
		setTemplateName(template.name);
		setTemplateLang(template.language);
		const c = getTemplatePlaceholderCounts(template);
		setHeaderMappings(
			Array.from({ length: c.header }, () => ({
				kind: "field",
				field: "customer.fullName",
			})),
		);
		setBodyMappings(
			Array.from({ length: c.body }, () => ({
				kind: "field",
				field: "customer.fullName",
			})),
		);
	};

	const onSubmit = async () => {
		if (!organizationId || !selectedTemplate) {
			return;
		}
		const variables = {
			header: headerMappings,
			body: bodyMappings,
			button: [],
		} as Parameters<typeof create.mutateAsync>[0]["variables"];
		const result = await create.mutateAsync({
			organizationId,
			name:
				broadcastName.trim() ||
				`${selectedTemplate.name} – ${new Date().toLocaleDateString()}`,
			templateName: selectedTemplate.name,
			templateLang: selectedTemplate.language,
			variables,
			audience: audienceInput as Parameters<
				typeof create.mutateAsync
			>[0]["audience"],
		});
		await navigate({
			to: "/app/$organizationSlug/marketing/$broadcastId",
			params: { organizationSlug, broadcastId: result.broadcast.id },
		});
	};

	const canAdvance = () => {
		if (step === "audience") {
			if (audienceTab === "manual") {
				return manualPhones.trim().length > 0;
			}
			if (audienceTab === "csv") {
				return csvText.trim().length > 0;
			}
			if (audienceTab === "salti_group") {
				return groupId.length > 0;
			}
			return true;
		}
		if (step === "template") {
			return !!selectedTemplate;
		}
		if (step === "variables") {
			return true;
		}
		return true;
	};

	const nextStep: Record<Step, Step | null> = {
		audience: "template",
		template: "variables",
		variables: "review",
		review: null,
	};
	const prevStep: Record<Step, Step | null> = {
		audience: null,
		template: "audience",
		variables: "template",
		review: "variables",
	};

	return (
		<PageShell
			title="New broadcast"
			backTo={`/app/${organizationSlug}/marketing`}
			backLabel="Back to broadcasts"
		>
			<div className="mb-6 flex items-center gap-2 text-sm">
				{(
					["audience", "template", "variables", "review"] as Step[]
				).map((s, i) => (
					<div
						key={s}
						className={`flex items-center gap-2 ${
							step === s
								? "font-medium text-foreground"
								: "text-muted-foreground"
						}`}
					>
						<div
							className={`flex size-6 items-center justify-center rounded-full border ${
								step === s
									? "border-primary bg-primary text-primary-foreground"
									: "border-border"
							}`}
						>
							{i + 1}
						</div>
						<span className="capitalize">{s}</span>
						{i < 3 ? (
							<ChevronRightIcon className="size-4 text-muted-foreground" />
						) : null}
					</div>
				))}
			</div>

			{
				{
					audience: (
						<AudienceStep
							audienceTab={audienceTab}
							setAudienceTab={setAudienceTab}
							customerFilters={customerFilters}
							setCustomerFilters={setCustomerFilters}
							iradiusGroups={iradiusGroups}
							groups={groups}
							groupId={groupId}
							setGroupId={setGroupId}
							manualPhones={manualPhones}
							setManualPhones={setManualPhones}
							csvText={csvText}
							setCsvText={setCsvText}
							preview={preview}
						/>
					),
					template: (
						<TemplateStep
							templates={templates}
							loading={templatesLoading}
							error={templatesError}
							selected={selectedTemplate}
							onSelect={onSelectTemplate}
						/>
					),
					variables: (
						<VariablesStep
							template={selectedTemplate}
							counts={counts}
							broadcastName={broadcastName}
							setBroadcastName={setBroadcastName}
							headerMappings={headerMappings}
							setHeaderMappings={setHeaderMappings}
							bodyMappings={bodyMappings}
							setBodyMappings={setBodyMappings}
							audienceTab={audienceTab}
						/>
					),
					review: (
						<ReviewStep
							template={selectedTemplate}
							broadcastName={broadcastName}
							headerMappings={headerMappings}
							bodyMappings={bodyMappings}
							preview={preview}
						/>
					),
				}[step]
			}

			<div className="mt-8 flex items-center justify-between border-t pt-4">
				<Button
					variant="ghost"
					disabled={!prevStep[step]}
					onClick={() => {
						const p = prevStep[step];
						if (p) {
							setStep(p);
						}
					}}
				>
					<ChevronLeftIcon className="size-4" />
					Back
				</Button>
				{step === "review" ? (
					<Button
						onClick={onSubmit}
						disabled={create.isPending || !selectedTemplate}
					>
						{create.isPending ? "Sending…" : "Launch broadcast"}
						<CheckIcon className="size-4" />
					</Button>
				) : (
					<Button
						onClick={() => {
							const n = nextStep[step];
							if (n) {
								setStep(n);
							}
						}}
						disabled={!canAdvance()}
					>
						Continue
						<ChevronRightIcon className="size-4" />
					</Button>
				)}
			</div>
		</PageShell>
	);
}

interface AudienceStepProps {
	audienceTab: AudienceTab;
	setAudienceTab: (t: AudienceTab) => void;
	customerFilters: CustomerFilters;
	setCustomerFilters: (f: CustomerFilters) => void;
	iradiusGroups: Array<{ id: number; name: string }>;
	groups: Array<{ id: number | string; name: string }>;
	groupId: string;
	setGroupId: (s: string) => void;
	manualPhones: string;
	setManualPhones: (s: string) => void;
	csvText: string;
	setCsvText: (s: string) => void;
	preview: ReturnType<typeof useAudiencePreviewQuery>;
}

function AudienceStep(props: AudienceStepProps) {
	return (
		<Tabs
			value={props.audienceTab}
			onValueChange={(v) => props.setAudienceTab(v as AudienceTab)}
		>
			<TabsList>
				<TabsTrigger value="isp_customers">ISP Customers</TabsTrigger>
				<TabsTrigger value="salti_group">Salti Group</TabsTrigger>
				<TabsTrigger value="csv">CSV upload</TabsTrigger>
				<TabsTrigger value="manual">Manual list</TabsTrigger>
			</TabsList>

			<TabsContent value="isp_customers" className="space-y-4 pt-4">
				<p className="text-sm text-muted-foreground">
					Filter your customer base. Customers without a phone number
					will be skipped.
				</p>
				<Field>
					<FieldLabel>Status</FieldLabel>
					<Select
						value={props.customerFilters.status ?? "ALL"}
						onValueChange={(v) =>
							props.setCustomerFilters({
								...props.customerFilters,
								status:
									v === "ALL"
										? undefined
										: (v as (typeof CUSTOMER_LIST_STATUSES)[number]),
							})
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Any status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="ALL">Any status</SelectItem>
							{CUSTOMER_LIST_STATUSES.map((s) => (
								<SelectItem key={s} value={s}>
									{s}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel>Group</FieldLabel>
					<Select
						value={props.customerFilters.groupName ?? "ALL"}
						onValueChange={(v) =>
							props.setCustomerFilters({
								...props.customerFilters,
								groupName: v === "ALL" ? undefined : v,
							})
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Any group" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="ALL">Any group</SelectItem>
							{props.iradiusGroups.map((g) => (
								<SelectItem key={g.id} value={g.name}>
									{g.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel>Connection type</FieldLabel>
					<Select
						value={props.customerFilters.connectionType ?? "ALL"}
						onValueChange={(v) =>
							props.setCustomerFilters({
								...props.customerFilters,
								connectionType:
									v === "ALL"
										? undefined
										: (v as ConnectionType),
							})
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Any connection" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="ALL">Any connection</SelectItem>
							{CONNECTION_TYPE_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel>Expires within (days)</FieldLabel>
					<Input
						type="number"
						min={0}
						max={365}
						placeholder="e.g. 7 for renewal nudges"
						value={props.customerFilters.expiresWithinDays ?? ""}
						onChange={(e) => {
							const v = e.target.value;
							props.setCustomerFilters({
								...props.customerFilters,
								expiresWithinDays:
									v === "" ? undefined : Number(v),
							});
						}}
					/>
				</Field>
				<Field>
					<FieldLabel>Minimum balance</FieldLabel>
					<Input
						type="number"
						step="0.01"
						placeholder="e.g. 0.01 for any debt"
						value={props.customerFilters.minBalance ?? ""}
						onChange={(e) => {
							const v = e.target.value;
							props.setCustomerFilters({
								...props.customerFilters,
								minBalance: v === "" ? undefined : Number(v),
							});
						}}
					/>
				</Field>
				<AudiencePreviewPanel preview={props.preview} />
			</TabsContent>

			<TabsContent value="salti_group" className="space-y-4 pt-4">
				<p className="text-sm text-muted-foreground">
					Pick a contact group you already manage in Salti.
				</p>
				<Field>
					<FieldLabel>Group</FieldLabel>
					<Select
						value={props.groupId}
						onValueChange={props.setGroupId}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a group" />
						</SelectTrigger>
						<SelectContent>
							{props.groups.map((g) => (
								<SelectItem
									key={String(g.id)}
									value={String(g.id)}
								>
									{g.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Alert>
					<TriangleAlertIcon className="size-4" />
					<AlertTitle>Heads up</AlertTitle>
					<AlertDescription>
						Salti-group sends happen entirely on Salti's side, so we
						can't show per-recipient delivery status here. Use the
						other audience types for full tracking.
					</AlertDescription>
				</Alert>
			</TabsContent>

			<TabsContent value="csv" className="space-y-4 pt-4">
				<p className="text-sm text-muted-foreground">
					Paste rows below in the format <code>phone,name</code> — one
					per line. Each row gets its own recipient row.
				</p>
				<Textarea
					rows={10}
					value={props.csvText}
					onChange={(e) => props.setCsvText(e.target.value)}
					placeholder="9613000001,Jad
9613000002,Sara"
				/>
				<AudiencePreviewPanel preview={props.preview} />
			</TabsContent>

			<TabsContent value="manual" className="space-y-4 pt-4">
				<p className="text-sm text-muted-foreground">
					Paste a list of phone numbers separated by commas, spaces,
					or line breaks.
				</p>
				<Textarea
					rows={8}
					value={props.manualPhones}
					onChange={(e) => props.setManualPhones(e.target.value)}
					placeholder="9613000001, 9613000002, 03999888"
				/>
				<AudiencePreviewPanel preview={props.preview} />
			</TabsContent>
		</Tabs>
	);
}

interface AudiencePreviewPanelProps {
	preview: ReturnType<typeof useAudiencePreviewQuery>;
}

function AudiencePreviewPanel({ preview }: AudiencePreviewPanelProps) {
	const { total, sample, note, isLoading, isFetching, error } = preview;

	if (error) {
		return (
			<Alert variant="error">
				<TriangleAlertIcon className="size-4" />
				<AlertTitle>Couldn't count recipients</AlertTitle>
				<AlertDescription>
					{error instanceof Error ? error.message : "Unknown error"}
				</AlertDescription>
			</Alert>
		);
	}

	const hasData = total !== null && total !== undefined;
	const isInitialLoad = isLoading && !hasData;

	return (
		<div className="rounded-lg border bg-muted/20 p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
						<UsersIcon className="size-5 text-primary" />
					</div>
					<div>
						<div className="text-xs uppercase tracking-wide text-muted-foreground">
							Will be sent to
						</div>
						<div className="text-2xl font-semibold">
							{isInitialLoad ? (
								<span className="inline-flex items-center gap-2 text-muted-foreground">
									<LoaderIcon className="size-4 animate-spin" />
									Counting…
								</span>
							) : note ? (
								<span className="text-base font-medium">
									Resolved on send
								</span>
							) : (
								<>
									{(total ?? 0).toLocaleString()}{" "}
									<span className="text-sm font-normal text-muted-foreground">
										{total === 1
											? "recipient"
											: "recipients"}
									</span>
								</>
							)}
						</div>
					</div>
				</div>
				{isFetching && hasData ? (
					<LoaderIcon className="size-4 animate-spin text-muted-foreground" />
				) : null}
			</div>

			{note ? (
				<p className="mt-3 text-xs text-muted-foreground">{note}</p>
			) : null}

			{hasData && total === 0 ? (
				<p className="mt-3 text-sm text-muted-foreground">
					No recipients match. Adjust filters or add phone numbers.
				</p>
			) : null}

			{sample.length > 0 ? (
				<div className="mt-3 border-t pt-3">
					<div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Sample ({sample.length}
						{total && total > sample.length
							? ` of ${total.toLocaleString()}`
							: ""}
						)
					</div>
					<ul className="space-y-1 text-sm">
						{sample.map((r, i) => (
							<li
								key={`${r.phone}-${i}`}
								className="flex items-center justify-between gap-2 font-mono text-xs"
							>
								<span>{r.phone}</span>
								<span className="font-sans text-muted-foreground">
									{r.contactName ?? ""}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

interface TemplateStepProps {
	templates: SaltiTemplate[];
	loading: boolean;
	error: unknown;
	selected: SaltiTemplate | undefined;
	onSelect: (t: SaltiTemplate) => void;
}

function TemplateStep({
	templates,
	loading,
	error,
	selected,
	onSelect,
}: TemplateStepProps) {
	if (loading) {
		return (
			<div className="h-40 animate-pulse rounded-lg border bg-muted/20" />
		);
	}
	if (error) {
		return (
			<Alert variant="error">
				<TriangleAlertIcon className="size-4" />
				<AlertTitle>Couldn't load templates</AlertTitle>
				<AlertDescription>
					{error instanceof Error ? error.message : "Unknown error"}.{" "}
					Make sure your Salti credentials are set up correctly under
					Settings → Marketing.
				</AlertDescription>
			</Alert>
		);
	}
	if (templates.length === 0) {
		return (
			<Alert>
				<TriangleAlertIcon className="size-4" />
				<AlertTitle>No approved templates</AlertTitle>
				<AlertDescription>
					Create and approve a WhatsApp template on the Meta Business
					side, then refresh this page.
				</AlertDescription>
			</Alert>
		);
	}
	return (
		<div className="grid gap-3 md:grid-cols-2">
			{templates.map((t) => {
				const isActive =
					selected?.name === t.name &&
					selected.language === t.language;
				const bodyText =
					t.components?.find(
						(c) => String(c.type).toUpperCase() === "BODY",
					)?.text ?? "";
				return (
					<button
						type="button"
						key={`${t.name}:${t.language}`}
						onClick={() => onSelect(t)}
						className={`text-left rounded-lg border p-4 transition ${
							isActive
								? "border-primary bg-primary/5"
								: "border-border hover:border-primary/40"
						}`}
					>
						<div className="flex items-center justify-between gap-2">
							<span className="font-medium">{t.name}</span>
							<Badge variant="outline">{t.language}</Badge>
						</div>
						{t.category ? (
							<div className="mt-1 text-xs text-muted-foreground">
								{t.category}
							</div>
						) : null}
						<p className="mt-2 text-sm text-muted-foreground line-clamp-3">
							{bodyText}
						</p>
					</button>
				);
			})}
		</div>
	);
}

interface VariablesStepProps {
	template: SaltiTemplate | undefined;
	counts: { header: number; body: number; button: number };
	broadcastName: string;
	setBroadcastName: (s: string) => void;
	headerMappings: VariableMapping[];
	setHeaderMappings: (m: VariableMapping[]) => void;
	bodyMappings: VariableMapping[];
	setBodyMappings: (m: VariableMapping[]) => void;
	audienceTab: AudienceTab;
}

function VariablesStep({
	template,
	counts,
	broadcastName,
	setBroadcastName,
	headerMappings,
	setHeaderMappings,
	bodyMappings,
	setBodyMappings,
	audienceTab,
}: VariablesStepProps) {
	if (!template) {
		return <p>Select a template first.</p>;
	}
	const ispMode = audienceTab === "isp_customers";

	const updateMapping = (
		list: VariableMapping[],
		set: (m: VariableMapping[]) => void,
		index: number,
		patch: Partial<VariableMapping>,
	) => {
		const copy = [...list];
		copy[index] = { ...copy[index], ...patch } as VariableMapping;
		set(copy);
	};

	const renderMappingRow = (
		mapping: VariableMapping,
		index: number,
		list: VariableMapping[],
		set: (m: VariableMapping[]) => void,
		label: string,
	) => (
		<div
			key={`${label}-${index}`}
			className="grid grid-cols-1 gap-2 rounded border p-3 md:grid-cols-[160px_1fr_200px]"
		>
			<div className="font-mono text-sm">{`${label}.{{${index + 1}}}`}</div>
			<Select
				value={mapping.kind}
				onValueChange={(v) =>
					updateMapping(list, set, index, {
						kind: v as "static" | "field",
					})
				}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{ispMode ? (
						<SelectItem value="field">Customer field</SelectItem>
					) : null}
					<SelectItem value="static">Static text</SelectItem>
				</SelectContent>
			</Select>
			{mapping.kind === "static" ? (
				<Input
					value={mapping.value ?? ""}
					onChange={(e) =>
						updateMapping(list, set, index, {
							value: e.target.value,
						})
					}
					placeholder="Enter text"
				/>
			) : (
				<Select
					value={mapping.field ?? ""}
					onValueChange={(v) =>
						updateMapping(list, set, index, { field: v })
					}
				>
					<SelectTrigger>
						<SelectValue placeholder="Pick field" />
					</SelectTrigger>
					<SelectContent>
						{CUSTOMER_VARIABLE_FIELDS.map((f) => (
							<SelectItem key={f.key} value={f.key}>
								{f.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</div>
	);

	return (
		<div className="space-y-4">
			<Field>
				<FieldLabel>Broadcast name (internal)</FieldLabel>
				<Input
					value={broadcastName}
					onChange={(e) => setBroadcastName(e.target.value)}
					placeholder={`${template.name} – ${new Date().toLocaleDateString()}`}
				/>
			</Field>

			{counts.header > 0 ? (
				<div className="space-y-2">
					<h3 className="font-medium">Header parameters</h3>
					{headerMappings.map((m, i) =>
						renderMappingRow(
							m,
							i,
							headerMappings,
							setHeaderMappings,
							"header",
						),
					)}
				</div>
			) : null}

			{counts.body > 0 ? (
				<div className="space-y-2">
					<h3 className="font-medium">Body parameters</h3>
					{bodyMappings.map((m, i) =>
						renderMappingRow(
							m,
							i,
							bodyMappings,
							setBodyMappings,
							"body",
						),
					)}
				</div>
			) : null}

			{counts.header === 0 && counts.body === 0 ? (
				<p className="text-sm text-muted-foreground">
					This template has no dynamic parameters. You can proceed
					straight to review.
				</p>
			) : null}
		</div>
	);
}

interface ReviewStepProps {
	template: SaltiTemplate | undefined;
	broadcastName: string;
	headerMappings: VariableMapping[];
	bodyMappings: VariableMapping[];
	preview: ReturnType<typeof useAudiencePreviewQuery>;
}

function ReviewStep({
	template,
	broadcastName,
	headerMappings,
	bodyMappings,
	preview,
}: ReviewStepProps) {
	if (!template) {
		return <p>Select a template first.</p>;
	}
	const bodyText =
		template.components?.find(
			(c) => String(c.type).toUpperCase() === "BODY",
		)?.text ?? "";

	// preview using static values where set, otherwise show the field name
	const previewValues = bodyMappings.map((m) =>
		m.kind === "static" ? (m.value ?? "") : `«${m.field ?? "?"}»`,
	);

	const rendered = renderPlaceholderPreview(bodyText, previewValues);

	return (
		<div className="space-y-4">
			<div className="rounded-lg border p-4">
				<div className="text-sm text-muted-foreground">Name</div>
				<div className="font-medium">
					{broadcastName ||
						`${template.name} – ${new Date().toLocaleDateString()}`}
				</div>
				<div className="mt-2 text-sm text-muted-foreground">
					Template
				</div>
				<div>
					{template.name}{" "}
					<Badge variant="outline" className="ml-1">
						{template.language}
					</Badge>
				</div>
			</div>

			<div className="rounded-lg border bg-muted/30 p-4">
				<div className="text-sm font-medium">Message preview</div>
				<pre className="mt-2 whitespace-pre-wrap text-sm">
					{rendered}
				</pre>
			</div>

			<AudiencePreviewPanel preview={preview} />

			{headerMappings.length === 0 && bodyMappings.length === 0 ? null : (
				<div className="rounded-lg border p-4 text-sm">
					<div className="font-medium">Variable mappings</div>
					{headerMappings.map((m, i) => (
						<div key={`h-${i}`} className="text-muted-foreground">
							header.{`{{${i + 1}}}`} → {summarize(m)}
						</div>
					))}
					{bodyMappings.map((m, i) => (
						<div key={`b-${i}`} className="text-muted-foreground">
							body.{`{{${i + 1}}}`} → {summarize(m)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function summarize(m: VariableMapping): string {
	if (m.kind === "static") {
		return `"${m.value ?? ""}"`;
	}
	return `field ${m.field ?? "?"}`;
}
