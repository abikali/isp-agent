import { bilingual } from "@repo/utils";
import { describe, expect, it } from "vitest";
import { FIELD_LABELS, fieldErrorMessage } from "./labels";

function rpcError(code: string, message: string) {
	return Object.assign(new Error(message), { code });
}

describe("fieldErrorMessage", () => {
	it("adds Arabic to an English permission refusal", () => {
		expect(
			fieldErrorMessage(
				rpcError(
					"FORBIDDEN",
					"You don't have permission to update this installations",
				),
				FIELD_LABELS.failedToSubmit,
			),
		).toBe(
			bilingual(
				"You don't have permission to update this installations",
				"ليس لديك صلاحية للقيام بهذا",
			),
		);
	});

	it("replaces the generic validation error", () => {
		expect(
			fieldErrorMessage(
				rpcError("BAD_REQUEST", "Input validation failed"),
				FIELD_LABELS.failedToSubmit,
			),
		).toBe(FIELD_LABELS.invalidInput);
	});

	it("keeps messages that are already bilingual", () => {
		const message = bilingual("No employee record", "لا يوجد سجل");
		expect(
			fieldErrorMessage(
				rpcError("FORBIDDEN", message),
				FIELD_LABELS.failedToSubmit,
			),
		).toBe(message);
	});

	it("falls back when the error is not an Error", () => {
		expect(fieldErrorMessage("boom", FIELD_LABELS.failedToSubmit)).toBe(
			FIELD_LABELS.failedToSubmit,
		);
	});
});
