export interface EmployeeCsvRow {
	name: string;
	email?: string | undefined;
	phone?: string | undefined;
	position?: string | undefined;
	department?: string | undefined;
	hireDate?: string | undefined;
	stationName?: string | undefined;
	notes?: string | undefined;
}

export interface EmployeeParseResult {
	rows: EmployeeCsvRow[];
	errors: string[];
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

function buildHeaderMap(headers: string[]): Map<string, number> {
	const map = new Map<string, number>();
	for (let i = 0; i < headers.length; i++) {
		const header = headers[i];
		if (header) {
			map.set(header.toLowerCase().trim(), i);
		}
	}
	return map;
}

function getField(
	fields: string[],
	headerMap: Map<string, number>,
	name: string,
): string | undefined {
	const idx = headerMap.get(name.toLowerCase());
	if (idx === undefined) {
		return undefined;
	}
	const val = fields[idx]?.trim();
	return val || undefined;
}

export function parseEmployeeCsv(csvText: string): EmployeeParseResult {
	const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) {
		return {
			rows: [],
			errors: ["CSV must have a header row and at least one data row"],
		};
	}

	const headerLine = lines[0];
	if (!headerLine) {
		return { rows: [], errors: ["Missing header row"] };
	}
	const headers = parseCsvLine(headerLine);
	const headerMap = buildHeaderMap(headers);

	if (!headerMap.has("name")) {
		return { rows: [], errors: ["CSV must have a 'Name' column"] };
	}

	const rows: EmployeeCsvRow[] = [];
	const errors: string[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (!line) {
			continue;
		}
		const fields = parseCsvLine(line);
		const name = getField(fields, headerMap, "name");
		if (!name) {
			errors.push(`Row ${i}: Missing name`);
			continue;
		}

		const email = getField(fields, headerMap, "email");
		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			errors.push(`Row ${i}: Invalid email "${email}"`);
			continue;
		}

		const row: EmployeeCsvRow = { name };
		if (email) {
			row.email = email;
		}
		const phone = getField(fields, headerMap, "phone");
		if (phone) {
			row.phone = phone;
		}
		const position = getField(fields, headerMap, "position");
		if (position) {
			row.position = position;
		}
		const department = getField(fields, headerMap, "department");
		if (department) {
			row.department = department;
		}
		const hireDate = getField(fields, headerMap, "hire date");
		if (hireDate) {
			row.hireDate = hireDate;
		}
		const stationName = getField(fields, headerMap, "station");
		if (stationName) {
			row.stationName = stationName;
		}
		const notes = getField(fields, headerMap, "notes");
		if (notes) {
			row.notes = notes;
		}

		rows.push(row);
	}

	return { rows, errors };
}

export function generateEmployeeCsvTemplate(): string {
	return "Name,Email,Phone,Position,Department,Hire Date,Station,Notes";
}

export function downloadCsv(content: string, filename: string): void {
	const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
