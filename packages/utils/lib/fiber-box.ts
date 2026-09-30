/**
 * Fiber "boxes": a customer's `mikrotikInterface` (iRadius
 * `UserNas.MikrotikInterface`) is the ONU VLAN it hangs off, e.g.
 * `(VM-PPPoe4)-vlan2032-zone4-olt1-PON4-samirhalabe`. Only PON / OLT
 * interfaces are boxes; AP sectors and switches are not.
 */
const BOX_INTERFACE_PATTERN = /(pon|olt)/i;

export function isBoxInterface(value: string | null | undefined): boolean {
	return Boolean(value && BOX_INTERFACE_PATTERN.test(value));
}

/** `olt1-PON4-samirhalabe` from `(VM-PPPoe4)-vlan2032-zone4-olt1-PON4-…`. */
export function boxShortName(iface: string): string {
	return iface
		.replace(/^\(VM-PPPoe\d*\)-/i, "")
		.replace(/^vlan\d+-/i, "")
		.replace(/^zone\d+-/i, "");
}
