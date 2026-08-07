"use client";

import { CUSTOMER_LIST_STATUSES } from "@repo/api/modules/customers/lib/statuses";
import type { AudienceInput } from "@repo/api/modules/marketing/lib/audience";
import type { SaltiTemplate } from "@repo/integrations";
import { useCollectors, useCustomerGroups } from "@saas/billing/client";
import { useIRadiusGroups, useStationsQuery } from "@saas/customers/client";
import { usePlansQuery } from "@saas/customers/hooks/use-plans";
import {
	CONNECTION_TYPE_LABELS,
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_LABELS,
} from "@saas/customers/lib/constants";
import { PageShell } from "@shared/components/PageShell";
import { formatDate } from "@shared/lib/format";
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
import { cn } from "@ui/lib";
import {
	CheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	FileTextIcon,
	LoaderIcon,
	PhoneIcon,
	SendIcon,
	SparklesIcon,
	TriangleAlertIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useAudiencePreviewQuery,
	useCreateBroadcast,
	useGroupsQuery,
	useTemplatesQuery,
	useUpdateBroadcast,
} from "../hooks/use-marketing";
import {
	CUSTOMER_VARIABLE_FIELDS,
	getTemplateHeader,
	getTemplatePlaceholderCounts,
	headerFormatToMediaKind,
	type TemplateHeaderFormat,
} from "../lib/template-placeholders";
import { MediaUploader } from "./MediaUploader";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { isPreviewMediaUrl } from "./media-utils";
import { WhatsAppPreview } from "./WhatsAppPreview";

type AudienceTab = "isp_customers" | "salti_group" | "csv" | "manual";
type Step = "audience" | "template" | "variables" | "review";

interface VariableMapping {
	kind: "static" | "field";
	value?: string;
	field?: string;
}

type ConnectionType = "FIBER" | "WIRELESS" | "DSL" | "CABLE" | "ETHERNET";

interface CustomerFilters {
	statuses: string[];
	planIds: string[];
	stationIds: string[];
	collectorIds: string[];
	groupNames: string[];
	connectionTypes: ConnectionType[];
	expiresWithinDays?: number;
	minBalance?: number;
}

// Hoisted locale-default date formatter — same output as the zero-arg
// toLocaleDateString(), without building a new Intl formatter per render.

const EMPTY_FILTERS: CustomerFilters = {
	statuses: [],
	planIds: [],
	stationIds: [],
	collectorIds: [],
	groupNames: [],
	connectionTypes: [],
};

export interface BroadcastWizardInitialState {
	broadcastId?: string;
	name?: string;
	templateName?: string;
	templateLang?: string;
	audience?: AudienceInput | unknown;
	variables?: {
		header?: VariableMapping[];
		body?: VariableMapping[];
		button?: VariableMapping[];
		headerMedia?: { kind?: string; url?: string };
	};
}

interface BroadcastWizardProps {
	organizationSlug: string;
	initial?: BroadcastWizardInitialState;
	/** Edit mode: writes via `update` and stays on the same broadcastId. */
	mode?: "create" | "edit";
}

const STEPS: { id: Step; label: string; icon: typeof UsersIcon }[] = [
	{ id: "audience", label: "Audience", icon: UsersIcon },
	{ id: "template", label: "Template", icon: FileTextIcon },
	{ id: "variables", label: "Variables", icon: SparklesIcon },
	{ id: "review", label: "Review", icon: SendIcon },
];

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive 4-step broadcast wizard; the steps share one state graph, splitting it scatters that flow without making it clearer
export function BroadcastWizard({
	organizationSlug,
	initial,
	mode = "create",
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- the slices (audience filters, template, variable mappings, name) are independent and edited from unrelated steps; one reducer would couple them artificially
}: BroadcastWizardProps) {
	const organizationId = useOrganizationId();
	const navigate = useNavigate();
	const {
		templates,
		isLoading: templatesLoading,
		error: templatesError,
	} = useTemplatesQuery();
	const { groups } = useGroupsQuery();
	const { groups: iradiusGroups } = useIRadiusGroups();
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();
	const { groups: customerGroups } = useCustomerGroups();
	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

	const create = useCreateBroadcast();
	const update = useUpdateBroadcast();

	const [step, setStep] = useState<Step>("audience");
	const [audienceTab, setAudienceTab] = useState<AudienceTab>(() =>
		coerceAudienceTab(initial?.audience),
	);

	const initialCustomerFilters = useMemo(
		() => coerceCustomerFilters(initial?.audience),
		[initial?.audience],
	);
	const [customerFilters, setCustomerFilters] = useState<CustomerFilters>(
		initialCustomerFilters,
	);

	const [groupIds, setGroupIds] = useState<string[]>(() =>
		coerceGroupIds(initial?.audience),
	);
	const [manualPhones, setManualPhones] = useState<string>(() =>
		coerceManualPhones(initial?.audience),
	);
	const [csvText, setCsvText] = useState<string>(() =>
		coerceCsvText(initial?.audience),
	);

	const [templateName, setTemplateName] = useState<string>(
		initial?.templateName ?? "",
	);
	const [templateLang, setTemplateLang] = useState<string>(
		initial?.templateLang ?? "",
	);
	const [broadcastName, setBroadcastName] = useState<string>(
		initial?.name ?? "",
	);

	const [headerMappings, setHeaderMappings] = useState<VariableMapping[]>(
		(initial?.variables?.header as VariableMapping[]) ?? [],
	);
	const [bodyMappings, setBodyMappings] = useState<VariableMapping[]>(
		(initial?.variables?.body as VariableMapping[]) ?? [],
	);
	const [headerMediaUrl, setHeaderMediaUrl] = useState<string>(
		initial?.variables?.headerMedia?.url ?? "",
	);

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

	const headerInfo = useMemo(
		() =>
			selectedTemplate
				? getTemplateHeader(selectedTemplate)
				: ({
						format: "NONE" as TemplateHeaderFormat,
						exampleMediaUrl: null,
					} as const),
		[selectedTemplate],
	);
	const headerMediaKind = headerFormatToMediaKind(headerInfo.format);

	// Keep mapping arrays sized to the template's placeholder count when the
	// template changes — including when it first resolves from the async
	// templates query in edit mode. Preserves operator-entered values for the
	// first N slots, drops/adds extra rows. Adjusting during render (instead of
	// in an effect) avoids the extra commit + flash and keeps the resize in sync
	// with the same render that surfaced the new template.
	// https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
	// react-doctor-disable-next-line react-doctor/rerender-state-only-in-handlers -- sizedForTemplate is read during render below (templateSig !== sizedForTemplate) to gate the resize; not a handler-only value
	const [sizedForTemplate, setSizedForTemplate] = useState<string | null>(
		null,
	);
	const templateSig = selectedTemplate
		? `${selectedTemplate.name}:${selectedTemplate.language}`
		: null;
	if (templateSig !== null && templateSig !== sizedForTemplate) {
		setSizedForTemplate(templateSig);
		setHeaderMappings((prev) => resizeMappings(prev, counts.header));
		setBodyMappings((prev) => resizeMappings(prev, counts.body));
		if (!headerMediaKind) {
			setHeaderMediaUrl("");
		}
	}

	const [debouncedManualPhones] = useDebouncedValue(manualPhones, {
		wait: 300,
	});
	const [debouncedCsvText] = useDebouncedValue(csvText, { wait: 300 });

	const audienceInput = useMemo<AudienceInput>(() => {
		if (audienceTab === "isp_customers") {
			return {
				type: "isp_customers",
				statuses: customerFilters.statuses as never,
				planIds: customerFilters.planIds,
				stationIds: customerFilters.stationIds,
				collectorIds: customerFilters.collectorIds,
				groupNames: customerFilters.groupNames,
				connectionTypes: customerFilters.connectionTypes,
				...(customerFilters.expiresWithinDays !== undefined && {
					expiresWithinDays: customerFilters.expiresWithinDays,
				}),
				...(customerFilters.minBalance !== undefined && {
					minBalance: customerFilters.minBalance,
				}),
			};
		}
		if (audienceTab === "salti_group") {
			const names = groupIds.flatMap((id) => {
				const name = groups.find((g) => String(g.id) === id)?.name;
				return name ? [name] : [];
			});
			return {
				type: "salti_group",
				groupIds,
				groupNames: names,
			};
		}
		if (audienceTab === "manual") {
			return {
				type: "manual",
				phones: debouncedManualPhones.split(/[\s,;]+/).flatMap((s) => {
					const trimmed = s.trim();
					return trimmed ? [trimmed] : [];
				}),
			};
		}
		const lines = debouncedCsvText.split("\n").flatMap((l) => {
			const trimmed = l.trim();
			return trimmed ? [trimmed] : [];
		});
		return {
			type: "csv",
			rows: lines.flatMap((l) => {
				const [phone, ...rest] = l.split(",").map((c) => c.trim());
				if (!phone) {
					return [];
				}
				return [
					{
						phone,
						name: rest[0] ?? undefined,
						variables: {},
					},
				];
			}),
		};
	}, [
		audienceTab,
		customerFilters,
		groupIds,
		groups,
		debouncedManualPhones,
		debouncedCsvText,
	]);

	const previewEnabled = useMemo(() => {
		switch (audienceInput.type) {
			case "isp_customers":
				return true;
			case "salti_group":
				return audienceInput.groupIds.length > 0;
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
		setHeaderMappings((prev) =>
			prev.length === c.header
				? prev
				: Array.from(
						{ length: c.header },
						(_, i) =>
							prev[i] ?? {
								kind: "field",
								field: "customer.fullName",
							},
					),
		);
		setBodyMappings((prev) =>
			prev.length === c.body
				? prev
				: Array.from(
						{ length: c.body },
						(_, i) =>
							prev[i] ?? {
								kind: "field",
								field: "customer.fullName",
							},
					),
		);
		// Don't auto-pull Meta's preview URL — it never delivers.
		const newHeader = getTemplateHeader(template);
		if (!headerFormatToMediaKind(newHeader.format)) {
			setHeaderMediaUrl("");
		}
	};

	const onSubmit = async () => {
		if (!organizationId || !selectedTemplate) {
			return;
		}
		const variables = {
			header: headerMappings,
			body: bodyMappings,
			button: [],
			...(headerMediaKind && headerMediaUrl.trim()
				? {
						headerMedia: {
							kind: headerMediaKind,
							url: headerMediaUrl.trim(),
						},
					}
				: {}),
		} as Parameters<typeof create.mutateAsync>[0]["variables"];
		const name =
			broadcastName.trim() ||
			`${selectedTemplate.name} – ${new Date().toLocaleDateString()}`;
		try {
			if (mode === "edit" && initial?.broadcastId) {
				await update.mutateAsync({
					organizationId,
					broadcastId: initial.broadcastId,
					name,
					templateName: selectedTemplate.name,
					templateLang: selectedTemplate.language,
					variables,
					audience: audienceInput as Parameters<
						typeof update.mutateAsync
					>[0]["audience"],
				});
				toast.success("Broadcast updated");
				await navigate({
					to: "/app/$organizationSlug/marketing/$broadcastId",
					params: {
						organizationSlug,
						broadcastId: initial.broadcastId,
					},
				});
			} else {
				const result = await create.mutateAsync({
					organizationId,
					name,
					templateName: selectedTemplate.name,
					templateLang: selectedTemplate.language,
					variables,
					audience: audienceInput as Parameters<
						typeof create.mutateAsync
					>[0]["audience"],
				});
				toast.success("Broadcast launched");
				await navigate({
					to: "/app/$organizationSlug/marketing/$broadcastId",
					params: {
						organizationSlug,
						broadcastId: result.broadcast.id,
					},
				});
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Save failed");
		}
	};

	const needsMediaUrl = !!headerMediaKind;
	const hasMediaUrl = headerMediaUrl.trim().length > 0;
	const hasValidMediaUrl = hasMediaUrl && !isPreviewMediaUrl(headerMediaUrl);
	const mediaReady = !needsMediaUrl || hasValidMediaUrl;

	const isPending = create.isPending || update.isPending;

	const canAdvance = () => {
		if (step === "audience") {
			if (audienceTab === "manual") {
				return manualPhones.trim().length > 0;
			}
			if (audienceTab === "csv") {
				return csvText.trim().length > 0;
			}
			if (audienceTab === "salti_group") {
				return groupIds.length > 0;
			}
			return true;
		}
		if (step === "template") {
			return !!selectedTemplate;
		}
		if (step === "variables") {
			return mediaReady;
		}
		return true;
	};

	const stepIndex = STEPS.findIndex((s) => s.id === step);
	const isLastStep = stepIndex === STEPS.length - 1;

	const headerValues = headerMappings.map(summarizeMappingValue);
	const bodyValues = bodyMappings.map(summarizeMappingValue);

	return (
		<PageShell
			title={mode === "edit" ? "Edit broadcast" : "New broadcast"}
			description={
				mode === "edit"
					? "Update audience, template, or variables. Changes overwrite the pending recipient list."
					: "Send a WhatsApp template message to your customers via Salti."
			}
			backTo={`/app/${organizationSlug}/marketing`}
			backLabel="Back to broadcasts"
		>
			<StepperBar
				step={step}
				onStepClick={setStep}
				canAdvance={canAdvance}
			/>

			<div className="grid gap-6 lg:grid-cols-[1fr_360px]">
				<div className="min-w-0 space-y-6">
					{step === "audience" && (
						<AudienceStep
							audienceTab={audienceTab}
							setAudienceTab={setAudienceTab}
							customerFilters={customerFilters}
							setCustomerFilters={setCustomerFilters}
							statusOptions={CUSTOMER_LIST_STATUSES.map((s) => ({
								value: s,
								label:
									CUSTOMER_STATUS_LABELS[s] ??
									formatStatus(s),
							}))}
							planOptions={plans.map((p) => ({
								value: p.id,
								label: p.name,
							}))}
							stationOptions={stations.map((s) => ({
								value: s.id,
								label: s.name,
							}))}
							collectorOptions={[
								{
									value: "none",
									label: "No collector assigned",
								},
								...collectors.map(
									(c: { id: string; name: string }) => ({
										value: c.id,
										label: c.name,
									}),
								),
							]}
							groupOptions={mergeGroupOptions(
								iradiusGroups,
								customerGroups,
							)}
							connectionTypeOptions={CONNECTION_TYPE_OPTIONS.map(
								(o) => ({ value: o.value, label: o.label }),
							)}
							groupIds={groupIds}
							setGroupIds={setGroupIds}
							saltiGroups={groups}
							manualPhones={manualPhones}
							setManualPhones={setManualPhones}
							csvText={csvText}
							setCsvText={setCsvText}
							preview={preview}
						/>
					)}

					{step === "template" && (
						<TemplateStep
							templates={templates}
							loading={templatesLoading}
							error={templatesError}
							selected={selectedTemplate}
							onSelect={onSelectTemplate}
						/>
					)}

					{step === "variables" && (
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
							headerMediaKind={headerMediaKind}
							headerMediaUrl={headerMediaUrl}
							setHeaderMediaUrl={setHeaderMediaUrl}
						/>
					)}

					{step === "review" && (
						<ReviewStep
							template={selectedTemplate}
							broadcastName={broadcastName}
							headerMappings={headerMappings}
							bodyMappings={bodyMappings}
							preview={preview}
							headerMediaKind={headerMediaKind}
							headerMediaUrl={headerMediaUrl}
							audienceInput={audienceInput}
						/>
					)}
				</div>

				<aside className="lg:sticky lg:top-6 lg:self-start">
					<div className="space-y-4">
						<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Live preview
						</div>
						<WhatsAppPreview
							template={selectedTemplate}
							headerValues={headerValues}
							bodyValues={bodyValues}
							headerMediaUrl={headerMediaUrl}
						/>
						<AudiencePreviewMini preview={preview} />
					</div>
				</aside>
			</div>

			<div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-2 border-t pt-4 sm:flex-row sm:items-center">
				<Button
					variant="ghost"
					disabled={stepIndex === 0}
					onClick={() => {
						if (stepIndex > 0) {
							const prev = STEPS[stepIndex - 1];
							if (prev) {
								setStep(prev.id);
							}
						}
					}}
				>
					<ChevronLeftIcon className="size-4" />
					Back
				</Button>
				<div className="flex items-center gap-2">
					{isLastStep ? (
						<Button
							onClick={onSubmit}
							disabled={
								isPending || !selectedTemplate || !mediaReady
							}
						>
							{isPending
								? "Saving…"
								: mode === "edit"
									? "Save changes"
									: "Launch broadcast"}
							<CheckIcon className="size-4" />
						</Button>
					) : (
						<Button
							onClick={() => {
								const next = STEPS[stepIndex + 1];
								if (next) {
									setStep(next.id);
								}
							}}
							disabled={!canAdvance()}
						>
							Continue
							<ChevronRightIcon className="size-4" />
						</Button>
					)}
				</div>
			</div>
		</PageShell>
	);
}

function StepperBar({
	step,
	onStepClick,
	canAdvance,
}: {
	step: Step;
	onStepClick: (s: Step) => void;
	canAdvance: () => boolean;
}) {
	const stepIndex = STEPS.findIndex((s) => s.id === step);
	return (
		<div className="mb-6 overflow-x-auto">
			<ol className="flex min-w-full items-center gap-2">
				{STEPS.map((s, i) => {
					const isActive = s.id === step;
					const isComplete = i < stepIndex;
					const canJump =
						i <= stepIndex || (i === stepIndex + 1 && canAdvance());
					return (
						<li
							key={s.id}
							className="flex flex-1 items-center gap-2"
						>
							<button
								type="button"
								disabled={!canJump}
								onClick={() => onStepClick(s.id)}
								className={cn(
									"flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
									isActive &&
										"border-primary bg-primary/5 text-foreground",
									!isActive &&
										isComplete &&
										"border-border bg-card text-muted-foreground hover:border-primary/40",
									!isActive &&
										!isComplete &&
										"border-border bg-card text-muted-foreground",
								)}
							>
								<div
									className={cn(
										"flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
										isActive &&
											"border-primary bg-primary text-primary-foreground",
										isComplete &&
											"border-primary bg-primary text-primary-foreground",
										!isActive &&
											!isComplete &&
											"border-border",
									)}
								>
									{isComplete ? (
										<CheckIcon className="size-3" />
									) : (
										i + 1
									)}
								</div>
								<div className="hidden min-w-0 truncate font-medium sm:block">
									{s.label}
								</div>
								<s.icon className="size-3.5 sm:hidden" />
							</button>
							{i < STEPS.length - 1 && (
								<ChevronRightIcon className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
							)}
						</li>
					);
				})}
			</ol>
		</div>
	);
}

interface AudienceStepProps {
	audienceTab: AudienceTab;
	setAudienceTab: (t: AudienceTab) => void;
	customerFilters: CustomerFilters;
	setCustomerFilters: (f: CustomerFilters) => void;
	statusOptions: { value: string; label: string }[];
	planOptions: { value: string; label: string }[];
	stationOptions: { value: string; label: string }[];
	collectorOptions: { value: string; label: string }[];
	groupOptions: { value: string; label: string }[];
	connectionTypeOptions: { value: string; label: string }[];
	groupIds: string[];
	setGroupIds: (ids: string[]) => void;
	saltiGroups: Array<{ id: number | string; name: string }>;
	manualPhones: string;
	setManualPhones: (s: string) => void;
	csvText: string;
	setCsvText: (s: string) => void;
	preview: ReturnType<typeof useAudiencePreviewQuery>;
}

function AudienceStep(props: AudienceStepProps) {
	return (
		<div className="space-y-4">
			<Tabs
				value={props.audienceTab}
				onValueChange={(v) => props.setAudienceTab(v as AudienceTab)}
			>
				<TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
					<TabsTrigger value="isp_customers">
						ISP Customers
					</TabsTrigger>
					<TabsTrigger value="salti_group">Salti Group</TabsTrigger>
					<TabsTrigger value="csv">CSV upload</TabsTrigger>
					<TabsTrigger value="manual">Manual list</TabsTrigger>
				</TabsList>

				<TabsContent
					value="isp_customers"
					className="space-y-4 rounded-lg border bg-card p-4"
				>
					<p className="text-sm text-muted-foreground">
						Filter your customer base. Customers without a phone
						number are skipped. Multiple values in the same filter
						are OR'd together.
					</p>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel>Status</FieldLabel>
							<MultiSelectFilter
								options={props.statusOptions}
								value={props.customerFilters.statuses}
								onChange={(v) =>
									props.setCustomerFilters({
										...props.customerFilters,
										statuses: v,
									})
								}
								placeholder="Any status"
							/>
						</Field>
						<Field>
							<FieldLabel>Plan</FieldLabel>
							<MultiSelectFilter
								options={props.planOptions}
								value={props.customerFilters.planIds}
								onChange={(v) =>
									props.setCustomerFilters({
										...props.customerFilters,
										planIds: v,
									})
								}
								placeholder="Any plan"
							/>
						</Field>
						<Field>
							<FieldLabel>Station</FieldLabel>
							<MultiSelectFilter
								options={props.stationOptions}
								value={props.customerFilters.stationIds}
								onChange={(v) =>
									props.setCustomerFilters({
										...props.customerFilters,
										stationIds: v,
									})
								}
								placeholder="Any station"
							/>
						</Field>
						<Field>
							<FieldLabel>Collector</FieldLabel>
							<MultiSelectFilter
								options={props.collectorOptions}
								value={props.customerFilters.collectorIds}
								onChange={(v) =>
									props.setCustomerFilters({
										...props.customerFilters,
										collectorIds: v,
									})
								}
								placeholder="Any collector"
							/>
						</Field>
						<Field>
							<FieldLabel>Group</FieldLabel>
							<MultiSelectFilter
								options={props.groupOptions}
								value={props.customerFilters.groupNames}
								onChange={(v) =>
									props.setCustomerFilters({
										...props.customerFilters,
										groupNames: v,
									})
								}
								placeholder="Any group"
							/>
						</Field>
						<Field>
							<FieldLabel>Connection type</FieldLabel>
							<MultiSelectFilter
								options={props.connectionTypeOptions}
								value={props.customerFilters.connectionTypes}
								onChange={(v) =>
									props.setCustomerFilters({
										...props.customerFilters,
										connectionTypes: v as ConnectionType[],
									})
								}
								placeholder="Any connection"
							/>
						</Field>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel>Expires within (days)</FieldLabel>
							<Input
								type="number"
								min={0}
								max={365}
								placeholder="e.g. 7 for renewal nudges"
								value={
									props.customerFilters.expiresWithinDays ??
									""
								}
								onChange={(e) => {
									const v = e.target.value;
									props.setCustomerFilters({
										...props.customerFilters,
										...(v === ""
											? { expiresWithinDays: undefined }
											: { expiresWithinDays: Number(v) }),
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
										...(v === ""
											? { minBalance: undefined }
											: { minBalance: Number(v) }),
									});
								}}
							/>
						</Field>
					</div>
					<AudiencePreviewPanel preview={props.preview} />
				</TabsContent>

				<TabsContent
					value="salti_group"
					className="space-y-4 rounded-lg border bg-card p-4"
				>
					<p className="text-sm text-muted-foreground">
						Pick one or more contact groups you manage in Salti.
					</p>
					<Field>
						<FieldLabel>Groups</FieldLabel>
						<MultiSelectFilter
							options={props.saltiGroups.map((g) => ({
								value: String(g.id),
								label: g.name,
							}))}
							value={props.groupIds}
							onChange={props.setGroupIds}
							placeholder="Select groups"
							emptyMessage="No Salti groups available"
						/>
					</Field>
					<Alert>
						<TriangleAlertIcon className="size-4" />
						<AlertTitle>Heads up</AlertTitle>
						<AlertDescription>
							Salti-group sends happen entirely on Salti's side,
							so we can't show per-recipient delivery status here.
							Use the other audience types for full tracking.
						</AlertDescription>
					</Alert>
				</TabsContent>

				<TabsContent
					value="csv"
					className="space-y-4 rounded-lg border bg-card p-4"
				>
					<p className="text-sm text-muted-foreground">
						Paste rows below in the format <code>phone,name</code> —
						one per line.
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

				<TabsContent
					value="manual"
					className="space-y-4 rounded-lg border bg-card p-4"
				>
					<p className="text-sm text-muted-foreground">
						Paste phone numbers separated by commas, spaces, or line
						breaks.
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
		</div>
	);
}

function AudiencePreviewPanel({
	preview,
}: {
	preview: ReturnType<typeof useAudiencePreviewQuery>;
}) {
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
			<div className="flex flex-wrap items-center justify-between gap-3">
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
					<ul className="grid gap-1 sm:grid-cols-2">
						{sample.map((r, i) => (
							// react-doctor-disable-next-line react-doctor/no-array-index-as-key -- read-only recipient preview; duplicate phones are possible and rows are never reordered or edited
							<li
								key={`${r.phone}-${i}`}
								className="flex items-center gap-2 text-xs"
							>
								<PhoneIcon className="size-3 text-muted-foreground" />
								<span className="font-mono">{r.phone}</span>
								{r.contactName && (
									<span className="truncate text-muted-foreground">
										· {r.contactName}
									</span>
								)}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

function AudiencePreviewMini({
	preview,
}: {
	preview: ReturnType<typeof useAudiencePreviewQuery>;
}) {
	const { total, note, isLoading } = preview;
	const hasData = total !== null && total !== undefined;
	return (
		<div className="rounded-lg border bg-card p-3 text-sm">
			<div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
				<UsersIcon className="size-3" />
				Audience
			</div>
			<div className="mt-1 font-semibold">
				{isLoading && !hasData ? (
					<span className="text-muted-foreground">Counting…</span>
				) : note ? (
					<span className="text-muted-foreground">
						Resolved on send
					</span>
				) : (
					<>
						{(total ?? 0).toLocaleString()}{" "}
						<span className="text-sm font-normal text-muted-foreground">
							recipients
						</span>
					</>
				)}
			</div>
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
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState<string>("ALL");

	const categories = useMemo(() => {
		const set = new Set<string>();
		for (const t of templates) {
			if (t.category) {
				set.add(t.category);
			}
		}
		return Array.from(set).sort();
	}, [templates]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return templates.filter((t) => {
			if (category !== "ALL" && t.category !== category) {
				return false;
			}
			if (!q) {
				return true;
			}
			const body =
				t.components?.find(
					(c) => String(c.type).toUpperCase() === "BODY",
				)?.text ?? "";
			return (
				t.name.toLowerCase().includes(q) ||
				body.toLowerCase().includes(q) ||
				t.language.toLowerCase().includes(q)
			);
		});
	}, [templates, search, category]);

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
					{error instanceof Error ? error.message : "Unknown error"}.
					Make sure your Salti credentials are set under Settings →
					Marketing.
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
		<div className="space-y-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search templates…"
					className="sm:max-w-xs"
				/>
				{categories.length > 0 && (
					<Select value={category} onValueChange={setCategory}>
						<SelectTrigger className="sm:w-48">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="ALL">All categories</SelectItem>
							{categories.map((c) => (
								<SelectItem key={c} value={c}>
									{c}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
				<div className="text-xs text-muted-foreground sm:ml-auto">
					{filtered.length} of {templates.length}
				</div>
			</div>
			{filtered.length === 0 ? (
				<p className="rounded-lg border border-dashed bg-muted/10 p-8 text-center text-sm text-muted-foreground">
					No templates match.
				</p>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{filtered.map((t) => {
						const isActive =
							selected?.name === t.name &&
							selected.language === t.language;
						const bodyText =
							t.components?.find(
								(c) => String(c.type).toUpperCase() === "BODY",
							)?.text ?? "";
						const header = t.components?.find(
							(c) => String(c.type).toUpperCase() === "HEADER",
						);
						return (
							<button
								type="button"
								key={`${t.name}:${t.language}`}
								onClick={() => onSelect(t)}
								className={cn(
									"flex h-full flex-col rounded-lg border p-4 text-left transition",
									isActive
										? "border-primary bg-primary/5"
										: "border-border bg-card hover:border-primary/40",
								)}
							>
								<div className="flex items-start justify-between gap-2">
									<span className="truncate font-medium">
										{t.name}
									</span>
									<Badge
										variant="outline"
										className="shrink-0 text-[10px] uppercase"
									>
										{t.language}
									</Badge>
								</div>
								<div className="mt-1 flex flex-wrap items-center gap-1.5">
									{t.category && (
										<Badge
											variant="secondary"
											className="text-[10px]"
										>
											{t.category}
										</Badge>
									)}
									{header?.format &&
										header.format !== "TEXT" && (
											<Badge
												variant="outline"
												className="text-[10px] uppercase"
											>
												{header.format} header
											</Badge>
										)}
								</div>
								<p className="mt-3 line-clamp-4 flex-1 text-sm text-muted-foreground">
									{bodyText || "No body text"}
								</p>
								{isActive && (
									<div className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
										<CheckIcon className="size-3" />
										Selected
									</div>
								)}
							</button>
						);
					})}
				</div>
			)}
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
	headerMediaKind: "image" | "video" | "document" | null;
	headerMediaUrl: string;
	setHeaderMediaUrl: (s: string) => void;
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
	headerMediaKind,
	headerMediaUrl,
	setHeaderMediaUrl,
}: VariablesStepProps) {
	if (!template) {
		return <p>Select a template first.</p>;
	}
	const ispMode = audienceTab === "isp_customers";
	const namePlaceholder = `${template.name} – ${formatDate(new Date())}`;

	const renderMappingRow = (
		mapping: VariableMapping,
		index: number,
		list: VariableMapping[],
		set: (m: VariableMapping[]) => void,
		label: string,
	) => (
		// react-doctor-disable-next-line react-doctor/no-array-index-as-key -- positional template placeholder slots ({{1}}, {{2}}…); the index is the stable identity and rows are only appended/dropped at the end, never reordered
		<div
			key={`${label}-${index}`}
			className="grid grid-cols-1 gap-2 rounded border bg-card p-3 sm:grid-cols-[120px_140px_1fr]"
		>
			<div className="font-mono text-sm text-muted-foreground">{`${label}.{{${index + 1}}}`}</div>
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
					placeholder={namePlaceholder}
				/>
			</Field>

			{headerMediaKind ? (
				<div className="space-y-2 rounded-lg border bg-card p-4">
					<div className="flex items-center justify-between gap-2">
						<h3 className="font-medium">Header media</h3>
						<Badge variant="outline" className="uppercase">
							{headerMediaKind}
						</Badge>
					</div>
					<p className="text-xs text-muted-foreground">
						This template has a {headerMediaKind} header. Every
						recipient sees the same media. Upload or paste a public
						URL.
					</p>
					<MediaUploader
						kind={headerMediaKind}
						value={headerMediaUrl}
						onChange={setHeaderMediaUrl}
					/>
				</div>
			) : null}

			{counts.header > 0 ? (
				<div className="space-y-2 rounded-lg border bg-card p-4">
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
				<div className="space-y-2 rounded-lg border bg-card p-4">
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

			{counts.header === 0 && counts.body === 0 && !headerMediaKind ? (
				<p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
					This template has no dynamic parameters. Proceed to review.
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
	headerMediaKind: "image" | "video" | "document" | null;
	headerMediaUrl: string;
	audienceInput: AudienceInput;
}

function ReviewStep({
	template,
	broadcastName,
	headerMappings,
	bodyMappings,
	preview,
	headerMediaKind,
	headerMediaUrl,
	audienceInput,
}: ReviewStepProps) {
	if (!template) {
		return <p>Select a template first.</p>;
	}

	const defaultName = `${template.name} – ${formatDate(new Date())}`;

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<ReviewCard
					title="Broadcast"
					rows={[
						{
							label: "Name",
							value: broadcastName || defaultName,
						},
						{ label: "Template", value: template.name },
						{ label: "Language", value: template.language },
						...(template.category
							? [
									{
										label: "Category",
										value: template.category,
									},
								]
							: []),
					]}
				/>
				<ReviewCard
					title="Audience"
					rows={summarizeAudience(audienceInput)}
				/>
			</div>

			{headerMediaKind && (
				<div className="rounded-lg border bg-card p-4 text-sm">
					<div className="flex items-center justify-between">
						<div className="font-medium">Header media</div>
						<Badge variant="outline" className="uppercase">
							{headerMediaKind}
						</Badge>
					</div>
					{headerMediaUrl ? (
						<a
							href={headerMediaUrl}
							target="_blank"
							rel="noreferrer"
							className="mt-1 block truncate text-xs text-muted-foreground underline"
						>
							{headerMediaUrl}
						</a>
					) : (
						<p className="mt-1 text-xs text-destructive">
							No URL set — send will fail.
						</p>
					)}
				</div>
			)}

			{(headerMappings.length > 0 || bodyMappings.length > 0) && (
				<div className="rounded-lg border bg-card p-4 text-sm">
					<div className="font-medium">Variable mappings</div>
					<dl className="mt-2 space-y-1 text-xs">
						{headerMappings.map((m, i) => (
							// react-doctor-disable-next-line react-doctor/no-array-index-as-key -- positional header placeholder rows ({{1}}, {{2}}…); index is the stable identity, never reordered
							<div
								key={`h-${i}`}
								className="flex items-baseline gap-2"
							>
								<dt className="font-mono text-muted-foreground">
									header.{`{{${i + 1}}}`}
								</dt>
								<dd>{summarize(m)}</dd>
							</div>
						))}
						{bodyMappings.map((m, i) => (
							// react-doctor-disable-next-line react-doctor/no-array-index-as-key -- positional body placeholder rows ({{1}}, {{2}}…); index is the stable identity, never reordered
							<div
								key={`b-${i}`}
								className="flex items-baseline gap-2"
							>
								<dt className="font-mono text-muted-foreground">
									body.{`{{${i + 1}}}`}
								</dt>
								<dd>{summarize(m)}</dd>
							</div>
						))}
					</dl>
				</div>
			)}

			<AudiencePreviewPanel preview={preview} />
		</div>
	);
}

function ReviewCard({
	title,
	rows,
}: {
	title: string;
	rows: { label: string; value: string }[];
}) {
	return (
		<div className="rounded-lg border bg-card p-4 text-sm">
			<div className="font-medium">{title}</div>
			<dl className="mt-2 space-y-1.5">
				{rows.map((r) => (
					<div key={r.label} className="flex items-baseline gap-2">
						<dt className="text-xs text-muted-foreground">
							{r.label}
						</dt>
						<dd className="ml-auto text-right">{r.value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

// ── helpers ──────────────────────────────────────────────────────────

function updateMapping(
	list: VariableMapping[],
	set: (m: VariableMapping[]) => void,
	index: number,
	patch: Partial<VariableMapping>,
): void {
	const copy = [...list];
	copy[index] = { ...copy[index], ...patch } as VariableMapping;
	set(copy);
}

function summarize(m: VariableMapping): string {
	if (m.kind === "static") {
		return `"${m.value ?? ""}"`;
	}
	return `field ${m.field ?? "?"}`;
}

function summarizeMappingValue(m: VariableMapping): string {
	if (m.kind === "static") {
		return m.value ?? "";
	}
	const label =
		CUSTOMER_VARIABLE_FIELDS.find((f) => f.key === m.field)?.label ??
		m.field ??
		"?";
	return `«${label}»`;
}

function resizeMappings(
	current: VariableMapping[],
	target: number,
): VariableMapping[] {
	if (current.length === target) {
		return current;
	}
	const result: VariableMapping[] = [];
	for (let i = 0; i < target; i++) {
		result.push(
			current[i] ?? {
				kind: "field",
				field: "customer.fullName",
			},
		);
	}
	return result;
}

function formatStatus(s: string): string {
	return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

function summarizeAudience(
	a: AudienceInput,
): { label: string; value: string }[] {
	if (a.type === "isp_customers") {
		const rows: { label: string; value: string }[] = [
			{ label: "Type", value: "ISP customers" },
		];
		if (a.statuses.length > 0) {
			rows.push({ label: "Status", value: a.statuses.join(", ") });
		}
		if (a.planIds.length > 0) {
			rows.push({
				label: "Plans",
				value: `${a.planIds.length} selected`,
			});
		}
		if (a.stationIds.length > 0) {
			rows.push({
				label: "Stations",
				value: `${a.stationIds.length} selected`,
			});
		}
		if (a.collectorIds.length > 0) {
			rows.push({
				label: "Collectors",
				value: `${a.collectorIds.length} selected`,
			});
		}
		if (a.groupNames.length > 0) {
			rows.push({
				label: "Groups",
				value: a.groupNames.join(", "),
			});
		}
		if (a.connectionTypes.length > 0) {
			rows.push({
				label: "Connection",
				value: a.connectionTypes
					.map((c) => CONNECTION_TYPE_LABELS[c] ?? c)
					.join(", "),
			});
		}
		if (a.expiresWithinDays !== undefined) {
			rows.push({
				label: "Expires within",
				value: `${a.expiresWithinDays} days`,
			});
		}
		if (a.minBalance !== undefined) {
			rows.push({ label: "Min balance", value: String(a.minBalance) });
		}
		return rows;
	}
	if (a.type === "salti_group") {
		return [
			{ label: "Type", value: "Salti group" },
			{
				label: "Groups",
				value:
					a.groupNames.join(", ") || `${a.groupIds.length} selected`,
			},
		];
	}
	if (a.type === "csv") {
		return [
			{ label: "Type", value: "CSV upload" },
			{ label: "Rows", value: String(a.rows.length) },
		];
	}
	return [
		{ label: "Type", value: "Manual list" },
		{ label: "Phones", value: String(a.phones.length) },
	];
}

function coerceAudienceTab(audience: unknown): AudienceTab {
	if (!audience || typeof audience !== "object") {
		return "isp_customers";
	}
	const type = (audience as { type?: string }).type;
	if (
		type === "isp_customers" ||
		type === "salti_group" ||
		type === "csv" ||
		type === "manual"
	) {
		return type;
	}
	return "isp_customers";
}

function coerceCustomerFilters(audience: unknown): CustomerFilters {
	if (
		audience &&
		typeof audience === "object" &&
		(audience as { type?: string }).type === "isp_customers"
	) {
		const a = audience as Record<string, unknown>;
		return {
			statuses: toArray(a["statuses"] ?? a["status"]),
			planIds: toArray(a["planIds"] ?? a["planId"]),
			stationIds: toArray(a["stationIds"] ?? a["stationId"]),
			collectorIds: toArray(a["collectorIds"] ?? a["collectorId"]),
			groupNames: toArray(a["groupNames"] ?? a["groupName"]),
			connectionTypes: toArray(
				a["connectionTypes"] ?? a["connectionType"],
			) as ConnectionType[],
			...(typeof a["expiresWithinDays"] === "number"
				? { expiresWithinDays: a["expiresWithinDays"] as number }
				: {}),
			...(typeof a["minBalance"] === "number"
				? { minBalance: a["minBalance"] as number }
				: {}),
		};
	}
	return EMPTY_FILTERS;
}

function coerceGroupIds(audience: unknown): string[] {
	if (!audience || typeof audience !== "object") {
		return [];
	}
	const a = audience as Record<string, unknown>;
	if (a["type"] !== "salti_group") {
		return [];
	}
	const ids = a["groupIds"] ?? a["groupId"];
	return toArray(ids).map(String);
}

function coerceManualPhones(audience: unknown): string {
	if (!audience || typeof audience !== "object") {
		return "";
	}
	const a = audience as Record<string, unknown>;
	if (a["type"] !== "manual") {
		return "";
	}
	const phones = a["phones"];
	if (Array.isArray(phones)) {
		return phones.join(", ");
	}
	return "";
}

function coerceCsvText(audience: unknown): string {
	if (!audience || typeof audience !== "object") {
		return "";
	}
	const a = audience as Record<string, unknown>;
	if (a["type"] !== "csv") {
		return "";
	}
	const rows = a["rows"];
	if (Array.isArray(rows)) {
		return rows
			.map((r) => {
				const row = r as { phone?: string; name?: string };
				return [row.phone, row.name].filter(Boolean).join(",");
			})
			.join("\n");
	}
	return "";
}

function toArray(v: unknown): string[] {
	if (Array.isArray(v)) {
		return v.map(String);
	}
	if (typeof v === "string" && v.length > 0) {
		return [v];
	}
	return [];
}

function mergeGroupOptions(
	iradiusGroups: Array<{ id: number; name: string }>,
	customerGroups: string[],
): { value: string; label: string }[] {
	const seen = new Set<string>();
	const out: { value: string; label: string }[] = [];
	for (const g of iradiusGroups) {
		if (!seen.has(g.name)) {
			seen.add(g.name);
			out.push({ value: g.name, label: g.name });
		}
	}
	for (const name of customerGroups) {
		if (!seen.has(name)) {
			seen.add(name);
			out.push({ value: name, label: name });
		}
	}
	return out;
}
