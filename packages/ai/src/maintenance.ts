/**
 * Effective maintenance state for an agent at a point in time.
 *
 * Maintenance can be triggered two ways, and they combine with OR:
 *  - the manual `maintenanceMode` toggle (instant, for surprise outages), or
 *  - a scheduled window whose `[startsAt, endsAt)` range contains "now".
 *
 * When active, the runtime applies full lockdown (no tools) and the agent
 * acknowledges the issue using `message`.
 */
export interface MaintenanceState {
	active: boolean;
	message: string | null;
}

/**
 * Compute the effective maintenance state.
 *
 * `activeWindows` MUST already be filtered by the caller to windows whose
 * range contains the current instant (the DB query does this with
 * `startsAt <= now < endsAt`), ordered by `endsAt` ascending. Keeping the
 * time filter in the query — not here — means this helper has a single source
 * of truth and no clock of its own, so it stays pure and unit-testable.
 *
 * Message precedence: the soonest-ending active window wins (it's the most
 * imminent planned event); if no window is active but the manual toggle is on,
 * the manual `maintenanceMessage` is used.
 */
export function resolveMaintenanceState(
	agent: {
		maintenanceMode?: boolean | null;
		maintenanceMessage?: string | null;
	},
	activeWindows: readonly { message: string }[] | null | undefined,
): MaintenanceState {
	const soonestWindow = activeWindows?.[0];
	if (soonestWindow) {
		return { active: true, message: soonestWindow.message };
	}

	if (agent.maintenanceMode) {
		return { active: true, message: agent.maintenanceMessage ?? null };
	}

	return { active: false, message: null };
}
