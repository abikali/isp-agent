import { describe, expect, it } from "vitest";
import {
	tgBold,
	tgCopyable,
	tgEscape,
	tgLink,
	tgMessage,
} from "./telegram-format";

describe("tgEscape", () => {
	it("escapes the three HTML-significant characters", () => {
		expect(tgEscape("Tom & <Jerry> > Spike")).toBe(
			"Tom &amp; &lt;Jerry&gt; &gt; Spike",
		);
	});

	it("escapes & before < so entities are not double-escaped", () => {
		// "&lt;" in the input must survive as a literal, not become "&amp;lt;"
		// applied in the wrong order — we escape & first, so this is the result.
		expect(tgEscape("a < b")).toBe("a &lt; b");
	});
});

describe("tgCopyable", () => {
	it("wraps escaped value in a <code> tag (tap-to-copy)", () => {
		expect(tgCopyable("user<1>")).toBe("<code>user&lt;1&gt;</code>");
	});
});

describe("tgBold", () => {
	it("wraps escaped value in <b>", () => {
		expect(tgBold("A & B")).toBe("<b>A &amp; B</b>");
	});
});

describe("tgLink", () => {
	it("escapes both label and url", () => {
		expect(tgLink("Open →", "https://x.test/?a=1&b=2")).toBe(
			'<a href="https://x.test/?a=1&amp;b=2">Open →</a>',
		);
	});
});

describe("tgMessage", () => {
	it("renders header, fields, and footer with copyable + labelled lines", () => {
		const out = tgMessage({
			icon: "🆕",
			title: "New customer request",
			fields: [
				{ icon: "👤", value: "Rami <Haddad>" },
				{
					icon: "🔢",
					label: "Account",
					value: "10234",
					copyable: true,
				},
				false,
				null,
			],
			footer: tgLink("Review →", "https://app.test/approvals"),
		});

		expect(out).toBe(
			[
				"🆕 <b>New customer request</b>",
				"",
				"👤 Rami &lt;Haddad&gt;",
				"🔢 <b>Account:</b> <code>10234</code>",
				"",
				'<a href="https://app.test/approvals">Review →</a>',
			].join("\n"),
		);
	});

	it("omits the body block when every field is falsy", () => {
		expect(
			tgMessage({ icon: "✅", title: "Done", fields: [null, false] }),
		).toBe("✅ <b>Done</b>");
	});
});
