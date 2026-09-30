import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGlobeSmsResponse, sendSms } from "../provider/globesms";
import { renderTemplate } from "../render";
import { EXPIRY_REMINDER_SMS, STOP_NOTICE_SMS } from "../templates";

describe("parseGlobeSmsResponse", () => {
	it("treats OK as success and captures the count", () => {
		const result = parseGlobeSmsResponse("OK: 1");
		expect(result.success).toBe(true);
		expect(result.providerMessageId).toBe("1");
	});

	it("treats ERR as a permanent failure with the reason", () => {
		const result = parseGlobeSmsResponse("ERR: Not authenticated");
		expect(result.success).toBe(false);
		expect(result.error).toBe("Not authenticated");
		expect(result.retriable).toBe(false);
	});

	it("treats an empty body as failure", () => {
		const result = parseGlobeSmsResponse("   ");
		expect(result.success).toBe(false);
		expect(result.error).toBe("Unknown SMS provider error");
	});

	it("treats unknown responses as failure", () => {
		const result = parseGlobeSmsResponse("something weird");
		expect(result.success).toBe(false);
		expect(result.raw).toBe("something weird");
	});
});

describe("sendSms", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.stubGlobal("fetch", fetchMock);
		vi.stubEnv("GLOBESMS_USERNAME", "hueob");
		vi.stubEnv("GLOBESMS_PASSWORD", "secret");
		vi.stubEnv("SMS_SENDER_ID", "");
		vi.stubEnv("GLOBESMS_ENDPOINT", "");
		fetchMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("builds the GlobeSMS URL params", async () => {
		fetchMock.mockResolvedValue(new Response("OK: 1", { status: 200 }));

		const result = await sendSms({ to: "96170123456", body: "مرحبا" });

		expect(result).toMatchObject({ success: true, providerMessageId: "1" });
		const url = fetchMock.mock.calls[0]?.[0] as URL;
		expect(url.origin + url.pathname).toBe(
			"https://globesms.net/smshub/api.php",
		);
		expect(Object.fromEntries(url.searchParams)).toEqual({
			username: "hueob",
			password: "secret",
			action: "sendsms",
			from: "Libancom",
			to: "96170123456",
			text: "مرحبا",
		});
	});

	it("honours SMS_SENDER_ID and GLOBESMS_ENDPOINT", async () => {
		vi.stubEnv("SMS_SENDER_ID", "LEJNE");
		vi.stubEnv("GLOBESMS_ENDPOINT", "https://example.test/api.php");
		fetchMock.mockResolvedValue(new Response("OK: 1"));

		await sendSms({ to: "96170123456", body: "x" });

		const url = fetchMock.mock.calls[0]?.[0] as URL;
		expect(url.host).toBe("example.test");
		expect(url.searchParams.get("from")).toBe("LEJNE");
	});

	it("reports not configured without calling the provider", async () => {
		vi.stubEnv("GLOBESMS_USERNAME", "");

		const result = await sendSms({ to: "96170123456", body: "x" });

		expect(result).toMatchObject({
			success: false,
			error: "SMS not configured",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("marks network errors retriable instead of throwing", async () => {
		fetchMock.mockRejectedValue(new Error("ECONNRESET"));

		const result = await sendSms({ to: "96170123456", body: "x" });

		expect(result.success).toBe(false);
		expect(result.retriable).toBe(true);
		expect(result.error).toContain("ECONNRESET");
	});

	it("marks HTTP 5xx retriable", async () => {
		fetchMock.mockResolvedValue(new Response("down", { status: 503 }));

		const result = await sendSms({ to: "96170123456", body: "x" });

		expect(result).toMatchObject({ success: false, retriable: true });
	});

	it("treats ERR as permanent", async () => {
		fetchMock.mockResolvedValue(new Response("ERR: No credit"));

		const result = await sendSms({ to: "96170123456", body: "x" });

		expect(result).toMatchObject({
			success: false,
			retriable: false,
			error: "No credit",
		});
	});
});

describe("renderTemplate", () => {
	it("substitutes known variables and blanks unknown ones", () => {
		expect(
			renderTemplate("Call {{phone}} {{missing}}!", { phone: "1" }),
		).toBe("Call 1 !");
	});

	it("substitutes Arabic tokens that contain spaces", () => {
		expect(
			renderTemplate("عقار {{رقم العقار}}", { "رقم العقار": "12" }),
		).toBe("عقار 12");
	});

	it("renders the customer templates with the contact number", () => {
		const reminder = renderTemplate(EXPIRY_REMINDER_SMS, {
			phone: "76 878 870",
		});
		expect(reminder).toContain("76 878 870");
		expect(reminder.startsWith("Libancom:")).toBe(true);
		expect(
			renderTemplate(STOP_NOTICE_SMS, { phone: "03 775 126" }),
		).toContain("03 775 126");
	});
});
