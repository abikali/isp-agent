export interface InstallLine {
	key: number;
	kind: "item" | "addon";
	stockItemId: string | null;
	addonType: "IPTV" | "REAL_IP" | null;
	quantity: number;
	price: number;
}

export function installLinesTotal(lines: InstallLine[]): number {
	return lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

export function linesToPayload(lines: InstallLine[]) {
	return lines.flatMap<{
		stockItemId?: string;
		addonType?: "IPTV" | "REAL_IP";
		quantity: number;
		price: number;
	}>((l) => {
		if (!(l.stockItemId || l.addonType)) {
			return [];
		}
		return l.kind === "item"
			? [
					{
						stockItemId: l.stockItemId as string,
						quantity: l.quantity,
						price: l.price,
					},
				]
			: [
					{
						addonType: l.addonType as "IPTV" | "REAL_IP",
						quantity: 1,
						price: l.price,
					},
				];
	});
}
