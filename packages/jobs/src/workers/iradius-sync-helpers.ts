/**
 * Shared pure helpers for iRadius sync.
 * Used by both the full-sync BullMQ worker and the per-entity API procedures.
 */

import {
	buildPhonesFromSync,
	type ConnectionType,
	type CustomerStatus,
	type EmployeeDepartment,
	normalizeLebanesePhone,
	splitPhoneString,
} from "@repo/database";

// ---------------------------------------------------------------------------
// Lookup maps interface
// ---------------------------------------------------------------------------

export interface SyncLookupMaps {
	planMap: Map<number, string>;
	planNames: Map<number, string>;
	stationMap: Map<number, string>;
	apMap: Map<number, string>;
	nasHostMap: Map<string, string>;
	employeeMap: Map<number, string>;
	dealerMap: Map<number, string>;
	activeDealerId: string | null;
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

export function deriveStatus(
	archived?: unknown,
	active?: unknown,
	blocked?: unknown,
): CustomerStatus {
	if (toBooleanFromBit(archived)) {
		return "INACTIVE";
	}
	if (toBooleanFromBit(blocked)) {
		return "SUSPENDED";
	}
	if (toBooleanFromBit(active)) {
		return "ACTIVE";
	}
	return "PENDING";
}

export function inferConnectionType(
	planName?: string | null,
): ConnectionType | null {
	if (!planName) {
		return "WIRELESS";
	}
	const lower = planName.toLowerCase();
	if (lower.includes("fiber") || lower.includes("ftth")) {
		return "FIBER";
	}
	if (lower.includes("dsl") || lower.includes("adsl")) {
		return "DSL";
	}
	return "WIRELESS";
}

export function safeDate(val: unknown): Date | null {
	if (!val) {
		return null;
	}
	if (val instanceof Date) {
		return Number.isNaN(val.getTime()) ? null : val;
	}
	const d = new Date(val as string);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function toBigInt(val: unknown): bigint {
	if (val == null) {
		return BigInt(0);
	}
	try {
		return BigInt(Math.floor(Number(val)));
	} catch {
		return BigInt(0);
	}
}

export function kbpsToMbps(kbps: unknown): number {
	const n = Number(kbps);
	if (!n || n <= 0) {
		return 0;
	}
	return Math.round(n / 1000);
}

export function toBooleanFromBit(val: unknown): boolean {
	if (Buffer.isBuffer(val)) {
		return val[0] === 1;
	}
	return Boolean(val);
}

// ---------------------------------------------------------------------------
// Profile maps
// ---------------------------------------------------------------------------

export const PROFILE_DEPARTMENT_MAP: Record<number, EmployeeDepartment> = {
	1: "MANAGEMENT",
	3: "MANAGEMENT",
	6: "BILLING",
	7: "CUSTOMER_SERVICE",
	8: "MANAGEMENT",
};

export const PROFILE_POSITION_MAP: Record<number, string> = {
	1: "Administrator",
	3: "Viewer",
	6: "Collector",
	7: "Help Desk",
	8: "Read Only",
};

// ---------------------------------------------------------------------------
// Row → data builders
// ---------------------------------------------------------------------------

export function buildCustomerDataFromRow(
	u: Record<string, unknown>,
	maps: SyncLookupMaps,
) {
	const planName = u["AccountTypeId"]
		? maps.planNames.get(u["AccountTypeId"] as number)
		: null;
	const planId = u["AccountTypeId"]
		? (maps.planMap.get(u["AccountTypeId"] as number) ?? null)
		: null;
	const stationId = u["StationId"]
		? (maps.stationMap.get(u["StationId"] as number) ?? null)
		: null;
	const accessPointId = u["AccessPointId"]
		? (maps.apMap.get(u["AccessPointId"] as number) ?? null)
		: null;

	const custParentId = u["ParentId"] as number | null;
	const dealerId =
		(custParentId ? maps.dealerMap.get(custParentId) : null) ??
		maps.activeDealerId;
	const collectorExtId = u["CollectorId"] as number | null;
	const collectorId = collectorExtId
		? (maps.employeeMap.get(collectorExtId) ?? null)
		: null;
	const nasHost = (u["NasHost"] as string) || null;
	const nasId = nasHost ? (maps.nasHostMap.get(nasHost) ?? null) : null;

	const collectorFirst = u["CollectorFirstName"] as string | null;
	const collectorLast = u["CollectorLastName"] as string | null;
	const collectorName =
		[collectorFirst, collectorLast].filter(Boolean).join(" ").trim() ||
		null;

	return {
		fullName:
			[u["FirstName"], u["LastName"]].filter(Boolean).join(" ").trim() ||
			"Unknown",
		firstName: (u["FirstName"] as string) || null,
		lastName: (u["LastName"] as string) || null,
		email: (u["MailAddress"] as string) || null,
		mobile: (() => {
			const first = splitPhoneString(
				(u["Mobile"] as string) || "",
			)[0]?.trim();
			return first ? normalizeLebanesePhone(first) : null;
		})(),
		phone: (() => {
			const first = splitPhoneString(
				(u["Phone"] as string) || "",
			)[0]?.trim();
			return first ? normalizeLebanesePhone(first) : null;
		})(),
		phones: JSON.parse(
			JSON.stringify(
				buildPhonesFromSync(
					(u["Mobile"] as string) || null,
					(u["Phone"] as string) || null,
				),
			),
		),
		address: (u["Address"] as string) || null,
		username: (u["UserName"] as string) || null,
		planId,
		stationId,
		accessPointId,
		dealerId,
		collectorId,
		nasId,
		originalCreatedAt: safeDate(u["CreationDate"]),
		status: deriveStatus(
			u["Archived"] as number,
			u["Active"] as number,
			u["Blocked"] as number,
		),
		connectionType: inferConnectionType(planName),
		ipAddress:
			(u["IpAddress"] as string) || (u["StaticIP"] as string) || null,
		macAddress: (u["MacAddress"] as string) || null,
		monthlyRate: (u["AccountPrice"] as number) ?? null,
		notes: (u["Comment"] as string) || null,
		externalId: String(u["Id"] as number),
		activatedAt: safeDate(u["ActivatedAccount"]),
		expiresAt: safeDate(u["ExpiryAccount"]),
		staticIp: (u["StaticIP"] as string) || null,
		nasHost,
		mikrotikUser: (u["MikrotikUser"] as string) || null,
		mikrotikInterface: (u["MikrotikInterface"] as string) || null,
		online: toBooleanFromBit(u["Online"]),
		downloadBytes: toBigInt(u["DownloadBytes"]),
		uploadBytes: toBigInt(u["UploadBytes"]),
		dailyDownloadBytes: toBigInt(u["DailyDownloadBytes"]),
		dailyUploadBytes: toBigInt(u["DailyUploadBytes"]),
		fupMode: Buffer.isBuffer(u["FupMode"])
			? u["FupMode"].toString("utf8").replace(/\0/g, "") || null
			: (u["FupMode"] as string) || null,
		automaticRenew: toBooleanFromBit(u["AutomaticRenew"]),
		iptvPrice: (u["IPTVPRICE"] as number) ?? 0,
		realIpPrice: (u["REALIPPRICE"] as number) ?? 0,
		discount: (u["Discount"] as number) ?? 0,
		latitude: (u["GSMLat"] as number) || null,
		longitude: (u["GSMLng"] as number) || null,
		categoryName: (u["CategoryName"] as string) || null,
		groupName: (u["GroupName"] as string) || null,
		collectorName,
		collectorPhone: (u["CollectorMobile"] as string) || null,
		mof: (u["MOF"] as string) || null,
		lastLogin: safeDate(u["LastLogin"]),
		lastLogOut: safeDate(u["UserLastLogOut"]),
		autoGenerateInvoice: toBooleanFromBit(u["AutoGenerateInvoice"]),
		financialCategoryId: (u["FinancialCategoryId"] as number) ?? null,
		linkId: (u["LinkId"] as number) ?? null,
		canResetAccount: toBooleanFromBit(u["CanResetAccount"]),
		collectorResetMac: toBooleanFromBit(u["CollectorResetMacAddress"]),
		collectorCanShowLinks: toBooleanFromBit(u["CollectorCanShowLinks"]),
		readOnly: toBooleanFromBit(u["ReadOnly"]),
		nasAccountId: (u["NasAccountId"] as number) ?? null,
		freeDownloadBytes: toBigInt(u["FreeDownloadBytes"]),
		freeUploadBytes: toBigInt(u["FreeUploadBytes"]),
		extraDaysToAddOnRefill:
			(u["ExtraDaysToAddWhenRefill"] as number) ?? null,
		extraDaysToDeductOnRefill:
			(u["ExtraDaysToDeductWhenRefill"] as number) ?? null,
		addedHours: (u["AddedHours"] as number) ?? null,
		extraUploadGb: (u["ExtraUploadGB"] as number) ?? null,
		extraDownloadGb: (u["ExtraDownloadGB"] as number) ?? null,
		canShowTrafficDetails: toBooleanFromBit(u["CanShowTraficDetails"]),
		oldAccountTypeId: (u["OldAccountTypeId"] as number) ?? null,
		forwardAccountTypeId: (u["ForwardAccountTypeId"] as number) ?? null,
		conditionAccountTypeId: (u["ConditionAccountTypeId"] as number) ?? null,
		deductMoney: (u["DeductMoney"] as number) ?? null,
		reachMaxQuota: toBooleanFromBit(u["ReachMaxQuota"]),
		tempUser: toBooleanFromBit(u["TempUser"]),
		tempExpiryAccount: safeDate(u["TempExpiryAccount"]),
		mikrotikQueue: (u["MikrotikQueue"] as string) || null,
		wirelessInterface: (u["WirelessInterface"] as string) || null,
		routerBrandPrefix: (u["RouterBrandPrefix"] as string) || null,
		overrideExpiryAccount: safeDate(u["OverrideExpiryAccount"]),
		forceExpiryAfterDays: (u["ForceExpiryAfterDays"] as number) ?? null,
		forceOverrideImmediateRecharge: toBooleanFromBit(
			u["ForceOverrideImmediatlyRecharge"],
		),
		overrideImmediateRecharge: toBooleanFromBit(
			u["OverrideImmediatlyRecharge"],
		),
		forceAutoBindAccToMac: toBooleanFromBit(u["ForceAutoBindAccToMac"]),
		overrideAutoBindAccToMac: toBooleanFromBit(
			u["OverrideAutoBindAccToMac"],
		),
		simultaneous: toBooleanFromBit(u["Simultaneous"]),
		apElectrical: toBooleanFromBit(u["APElectrical"]),
		excludeDailyDownloadBytes: toBigInt(u["ExcludeDailyDownloadBytes"]),
		excludeDailyUploadBytes: toBigInt(u["ExcludeDailyUploadBytes"]),
		excludeMonthlyDownloadBytes: toBigInt(u["ExcludeMontlyDownloadBytes"]),
		excludeMonthlyUploadBytes: toBigInt(u["ExcludeMontlyUploadBytes"]),
		freeDailyDownloadBytes: toBigInt(u["FreeDailyDownloadBytes"]),
		freeDailyUploadBytes: toBigInt(u["FreeDailyUploadBytes"]),
		excludeFreeDailyDownloadBytes: toBigInt(
			u["ExcludeFreeDailyDownloadBytes"],
		),
		excludeFreeMonthlyDownloadBytes: toBigInt(
			u["ExcludeFreeMontlyDownloadBytes"],
		),
		excludeFreeDailyUploadBytes: toBigInt(u["ExcludeFreeDailyUploadBytes"]),
		excludeFreeMonthlyUploadBytes: toBigInt(
			u["ExcludeFreeMontlyUploadBytes"],
		),
		nasLastLogOut: safeDate(u["NasLastLogOut"]),
		mikrotikInterface1: (u["MikrotikInterface1"] as string) || null,
	};
}

export function buildEmployeeDataFromRow(
	emp: Record<string, unknown>,
	maps: SyncLookupMaps,
) {
	const profileId = emp["ProfileId"] as number;
	const parentId = emp["ParentId"] as number | null;
	const empDealerId =
		(parentId ? maps.dealerMap.get(parentId) : null) ?? maps.activeDealerId;

	return {
		name:
			[emp["FirstName"], emp["LastName"]]
				.filter(Boolean)
				.join(" ")
				.trim() || "Unknown",
		email: (emp["MailAddress"] as string) || null,
		phone: (emp["Mobile"] as string) || (emp["Phone"] as string) || null,
		externalId: String(emp["Id"] as number),
		username: (emp["UserName"] as string) || null,
		iRadiusProfile: PROFILE_POSITION_MAP[profileId] ?? null,
		department: PROFILE_DEPARTMENT_MAP[profileId] ?? null,
		position: PROFILE_POSITION_MAP[profileId] ?? null,
		hireDate: safeDate(emp["CreationDate"]),
		dealerId: empDealerId,
	};
}

// ---------------------------------------------------------------------------
// SQL queries (shared between worker and API)
// ---------------------------------------------------------------------------

export const CUSTOMER_SELECT_COLUMNS = `u.Id AS Id, u.UserName, u.FirstName, u.LastName, u.Mobile, u.Phone,
	u.MailAddress, u.Address, u.Comment, u.AccountPrice, u.Discount,
	u.Archived, u.CreationDate, u.CollectorId, u.ParentId,
	u.MOF, u.LastLogin, u.LastLogOut AS UserLastLogOut,
	u.AutoGenerateInvoice, u.FinancialCategoryId, u.LinkId,
	u.CanResetAccount, u.CollectorResetMacAddress, u.CollectorCanShowLinks, u.ReadOnly,
	c.FirstName as CollectorFirstName, c.LastName as CollectorLastName,
	c.Phone as CollectorMobile,
	uc.Name as CategoryName, ug.Name as GroupName,
	un.Id AS NasAccountId,
	un.AccountTypeId, un.ActivatedAccount, un.ExpiryAccount,
	un.StaticIP, un.IpAddress, un.MacAddress, un.NasHost,
	un.Online, un.Active, un.Blocked, un.FupMode,
	un.DownloadBytes, un.UploadBytes,
	un.DailyDownloadBytes, un.DailyUploadBytes,
	un.AutomaticRenew, un.IPTVPRICE, un.REALIPPRICE,
	un.StationId, un.AccessPointId,
	un.GSMLat, un.GSMLng, un.MikrotikInterface, un.MikrotikUser,
	un.FreeDownloadBytes, un.FreeUploadBytes,
	un.ExtraDaysToAddWhenRefill, un.ExtraDaysToDeductWhenRefill,
	un.AddedHours, un.ExtraUploadGB, un.ExtraDownloadGB, un.CanShowTraficDetails,
	un.OldAccountTypeId, un.ForwardAccountTypeId, un.ConditionAccountTypeId,
	un.DeductMoney, un.ReachMaxQuota, un.TempUser,
	un.TempExpiryAccount, un.MikrotikQueue, un.WirelessInterface, un.RouterBrandPrefix,
	un.OverrideExpiryAccount, un.ForceExpiryAfterDays,
	un.ForceOverrideImmediatlyRecharge, un.OverrideImmediatlyRecharge,
	un.ForceAutoBindAccToMac, un.OverrideAutoBindAccToMac, un.Simultaneous,
	un.APElectrical,
	un.ExcludeDailyDownloadBytes, un.ExcludeDailyUploadBytes,
	un.ExcludeMontlyDownloadBytes, un.ExcludeMontlyUploadBytes,
	un.FreeDailyDownloadBytes, un.FreeDailyUploadBytes,
	un.ExcludeFreeDailyDownloadBytes, un.ExcludeFreeMontlyDownloadBytes,
	un.ExcludeFreeDailyUploadBytes, un.ExcludeFreeMontlyUploadBytes,
	un.LastLogOut AS NasLastLogOut, un.MikrotikInterface1`;

export const CUSTOMER_FROM_CLAUSE = `FROM User u
	LEFT JOIN UserNas un ON un.UserId = u.Id
	LEFT JOIN User c ON c.Id = u.CollectorId
	LEFT JOIN UserCategory uc ON uc.Id = u.UserCategoryId
	LEFT JOIN UserGroup ug ON ug.Id = u.UserGroupId`;

export const EMPLOYEE_SELECT_COLUMNS = `u.Id, u.UserName, u.FirstName, u.LastName, u.Mobile, u.Phone,
	u.MailAddress, u.ParentId, u.ProfileId, u.CreationDate`;
