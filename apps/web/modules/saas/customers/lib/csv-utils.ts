import { CSV_HEADERS } from "./constants";

export interface CsvRow {
	fullName: string;
	email?: string | undefined;
	phone?: string | undefined;
	address?: string | undefined;
	username?: string | undefined;
	planName?: string | undefined;
	stationName?: string | undefined;
	connectionType?: string | undefined;
	ipAddress?: string | undefined;
	macAddress?: string | undefined;
	monthlyRate?: number | undefined;
	billingDay?: number | undefined;
	notes?: string | undefined;
}

export interface ParseResult {
	rows: CsvRow[];
	errors: Array<{ row: number; error: string }>;
}

function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			fields.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	fields.push(current.trim());
	return fields;
}

/** Maps header names to their column indices */
function buildHeaderMap(headerLine: string): Map<string, number> {
	const headers = parseCsvLine(headerLine);
	const map = new Map<string, number>();
	for (let i = 0; i < headers.length; i++) {
		const normalized = (headers[i] ?? "").toLowerCase().trim();
		if (normalized) {
			map.set(normalized, i);
		}
	}
	return map;
}

/** Gets a field value by header name */
function getField(
	fields: string[],
	headerMap: Map<string, number>,
	headerName: string,
): string {
	const normalizedName = headerName.toLowerCase();
	const index = headerMap.get(normalizedName);
	if (index === undefined) {
		return "";
	}
	return (fields[index] ?? "").trim();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_CONNECTION_TYPES = new Set([
	"FIBER",
	"WIRELESS",
	"DSL",
	"CABLE",
	"ETHERNET",
]);

export function parseCsv(csvText: string): ParseResult {
	const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) {
		return {
			rows: [],
			errors: [
				{
					row: 0,
					error: "CSV must have a header row and at least one data row",
				},
			],
		};
	}

	const headerLine = lines[0] ?? "";
	const headerMap = buildHeaderMap(headerLine);

	// Verify at least "Full Name" header exists
	if (!headerMap.has("full name")) {
		return {
			rows: [],
			errors: [
				{
					row: 1,
					error: 'Missing required "Full Name" column header. Download the template for the expected format.',
				},
			],
		};
	}

	const rows: CsvRow[] = [];
	const errors: Array<{ row: number; error: string }> = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (!line) {
			continue;
		}
		const fields = parseCsvLine(line);
		const rowNumber = i + 1;

		const fullName = getField(fields, headerMap, "Full Name");
		if (!fullName) {
			errors.push({ row: rowNumber, error: "Full Name is required" });
			continue;
		}

		const rowErrors: string[] = [];
		const row: CsvRow = { fullName };

		const email = getField(fields, headerMap, "Email");
		if (email) {
			if (!EMAIL_REGEX.test(email)) {
				rowErrors.push(`Invalid email "${email}"`);
			} else {
				row.email = email;
			}
		}

		const phone = getField(fields, headerMap, "Phone");
		if (phone) {
			row.phone = phone;
		}

		const address = getField(fields, headerMap, "Address");
		if (address) {
			row.address = address;
		}

		const username = getField(fields, headerMap, "Username");
		if (username) {
			row.username = username;
		}

		const planName = getField(fields, headerMap, "Plan");
		if (planName) {
			row.planName = planName;
		}

		const stationName = getField(fields, headerMap, "Station");
		if (stationName) {
			row.stationName = stationName;
		}

		const connectionType = getField(fields, headerMap, "Connection Type");
		if (connectionType) {
			const ct = connectionType.toUpperCase();
			if (!VALID_CONNECTION_TYPES.has(ct)) {
				rowErrors.push(
					`Invalid connection type "${connectionType}". Must be one of: Fiber, Wireless, DSL, Cable, Ethernet`,
				);
			} else {
				row.connectionType = ct;
			}
		}

		const ipAddress = getField(fields, headerMap, "IP Address");
		if (ipAddress) {
			row.ipAddress = ipAddress;
		}

		const macAddress = getField(fields, headerMap, "MAC Address");
		if (macAddress) {
			row.macAddress = macAddress;
		}

		const monthlyRateStr = getField(fields, headerMap, "Monthly Rate");
		if (monthlyRateStr) {
			const rate = Number.parseFloat(monthlyRateStr);
			if (Number.isNaN(rate) || rate < 0) {
				rowErrors.push(
					`Invalid monthly rate "${monthlyRateStr}". Must be a positive number`,
				);
			} else {
				row.monthlyRate = rate;
			}
		}

		const billingDayStr = getField(fields, headerMap, "Billing Day");
		if (billingDayStr) {
			const day = Number.parseInt(billingDayStr, 10);
			if (Number.isNaN(day) || day < 1 || day > 28) {
				rowErrors.push(
					`Invalid billing day "${billingDayStr}". Must be between 1 and 28`,
				);
			} else {
				row.billingDay = day;
			}
		}

		const notes = getField(fields, headerMap, "Notes");
		if (notes) {
			row.notes = notes;
		}

		if (rowErrors.length > 0) {
			errors.push({ row: rowNumber, error: rowErrors.join("; ") });
			continue;
		}

		rows.push(row);
	}

	return { rows, errors };
}

export function generateCsvTemplate(): string {
	const header = CSV_HEADERS.join(",");
	const sampleRows = [
		'Ahmad Khalil,ahmad.khalil@email.com,+961 71 123 456,"Beirut, Hamra St. Block 5",akhalil,Fiber 50Mbps,Hamra Tower,FIBER,10.0.1.101,AA:BB:CC:11:22:33,45.00,1,Residential customer',
		"Sara Nassar,sara.nassar@email.com,+961 76 654 321,Tripoli Mina District,snassar,Wireless 25Mbps,Mina Station,WIRELESS,10.0.2.55,DD:EE:FF:44:55:66,30.00,15,Business owner",
		"Omar Haddad,omar.h@email.com,+961 03 987 654,Jounieh Main Road,ohaddad,Fiber 100Mbps,Jounieh Central,FIBER,10.0.3.200,11:22:33:AA:BB:CC,75.00,10,Premium plan - upgraded from 50Mbps",
		"Nour Fakhoury,nour.f@email.com,+961 70 111 222,Saida Old City,nfakhoury,DSL 10Mbps,Saida Hub,DSL,10.0.4.30,77:88:99:DD:EE:FF,20.00,5,",
		"Rami Karam,,+961 78 333 444,Baalbek Center,rkaram,Cable 30Mbps,Baalbek Node,CABLE,10.0.5.88,AB:CD:EF:12:34:56,35.00,20,No email on file",
	];
	return [header, ...sampleRows].join("\n");
}

export function downloadCsv(content: string, filename: string) {
	const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
