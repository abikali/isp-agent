import { describe, expect, it } from "vitest";
import { isPrivateIP, validateWebhookUrl } from "../security";

describe("isPrivateIP", () => {
	describe("localhost variants", () => {
		it("should block 'localhost'", () => {
			expect(isPrivateIP("localhost")).toBe(true);
		});

		it("should block '127.0.0.1'", () => {
			expect(isPrivateIP("127.0.0.1")).toBe(true);
		});

		it("should block '::1' (IPv6 localhost)", () => {
			expect(isPrivateIP("::1")).toBe(true);
		});

		it("should block '[::1]' (bracketed IPv6 localhost)", () => {
			expect(isPrivateIP("[::1]")).toBe(true);
		});

		it("should block subdomains of localhost", () => {
			expect(isPrivateIP("foo.localhost")).toBe(true);
			expect(isPrivateIP("api.localhost")).toBe(true);
		});

		it("should be case-insensitive", () => {
			expect(isPrivateIP("LOCALHOST")).toBe(true);
			expect(isPrivateIP("LocalHost")).toBe(true);
		});
	});

	describe("loopback range (127.x.x.x)", () => {
		it("should block any 127.x.x.x address", () => {
			expect(isPrivateIP("127.0.0.2")).toBe(true);
			expect(isPrivateIP("127.255.255.255")).toBe(true);
		});
	});

	describe("private IPv4 ranges", () => {
		it("should block 10.x.x.x (Class A private)", () => {
			expect(isPrivateIP("10.0.0.1")).toBe(true);
			expect(isPrivateIP("10.255.255.255")).toBe(true);
		});

		it("should block 172.16-31.x.x (Class B private)", () => {
			expect(isPrivateIP("172.16.0.1")).toBe(true);
			expect(isPrivateIP("172.31.255.255")).toBe(true);
		});

		it("should NOT block 172.15.x.x or 172.32.x.x", () => {
			expect(isPrivateIP("172.15.0.1")).toBe(false);
			expect(isPrivateIP("172.32.0.1")).toBe(false);
		});

		it("should block 192.168.x.x (Class C private)", () => {
			expect(isPrivateIP("192.168.0.1")).toBe(true);
			expect(isPrivateIP("192.168.255.255")).toBe(true);
		});

		it("should block 169.254.x.x (link-local)", () => {
			expect(isPrivateIP("169.254.0.1")).toBe(true);
			expect(isPrivateIP("169.254.255.255")).toBe(true);
		});

		it("should block 0.x.x.x (invalid/any)", () => {
			expect(isPrivateIP("0.0.0.0")).toBe(true);
			expect(isPrivateIP("0.1.2.3")).toBe(true);
		});
	});

	describe("private IPv6 ranges", () => {
		it("should block fe80: (link-local)", () => {
			expect(isPrivateIP("fe80::1")).toBe(true);
			expect(isPrivateIP("[fe80::1]")).toBe(true);
		});

		it("should block fc (unique local)", () => {
			expect(isPrivateIP("fc00::1")).toBe(true);
			expect(isPrivateIP("[fc00::1]")).toBe(true);
		});

		it("should block fd (unique local)", () => {
			expect(isPrivateIP("fd00::1")).toBe(true);
			expect(isPrivateIP("[fd00::1]")).toBe(true);
		});
	});

	describe("public IPs", () => {
		it("should allow public IPv4 addresses", () => {
			expect(isPrivateIP("8.8.8.8")).toBe(false);
			expect(isPrivateIP("1.1.1.1")).toBe(false);
			expect(isPrivateIP("93.184.216.34")).toBe(false);
		});

		it("should allow public hostnames", () => {
			expect(isPrivateIP("example.com")).toBe(false);
			expect(isPrivateIP("webhook.site")).toBe(false);
			expect(isPrivateIP("api.stripe.com")).toBe(false);
		});
	});
});

describe("validateWebhookUrl", () => {
	describe("valid URLs", () => {
		it("should accept valid HTTPS URLs", () => {
			expect(
				validateWebhookUrl("https://example.com/webhook"),
			).toBeNull();
			expect(
				validateWebhookUrl("https://api.stripe.com/v1/webhook"),
			).toBeNull();
		});

		it("should accept valid HTTP URLs", () => {
			expect(validateWebhookUrl("http://example.com/webhook")).toBeNull();
		});
	});

	describe("invalid URL format", () => {
		it("should reject invalid URLs", () => {
			expect(validateWebhookUrl("not-a-url")).toBe("Invalid URL format");
			expect(validateWebhookUrl("ftp://example.com")).toBe(
				"Webhook URL must use HTTPS or HTTP protocol",
			);
		});
	});

	describe("SSRF prevention - localhost", () => {
		it("should reject localhost URLs", () => {
			const result = validateWebhookUrl("http://localhost:3000/webhook");
			expect(result).toBe(
				"Webhook URL cannot point to localhost or private IP addresses",
			);
		});

		it("should reject 127.0.0.1 URLs", () => {
			const result = validateWebhookUrl("http://127.0.0.1:3000/webhook");
			expect(result).toBe(
				"Webhook URL cannot point to localhost or private IP addresses",
			);
		});

		it("should reject IPv6 localhost URLs", () => {
			const result = validateWebhookUrl("http://[::1]:3000/webhook");
			expect(result).toBe(
				"Webhook URL cannot point to localhost or private IP addresses",
			);
		});
	});

	describe("SSRF prevention - private IPs", () => {
		it("should reject 10.x.x.x URLs", () => {
			const result = validateWebhookUrl("http://10.0.0.1:8080/internal");
			expect(result).toBe(
				"Webhook URL cannot point to localhost or private IP addresses",
			);
		});

		it("should reject 172.16.x.x URLs", () => {
			const result = validateWebhookUrl("http://172.16.0.1/api");
			expect(result).toBe(
				"Webhook URL cannot point to localhost or private IP addresses",
			);
		});

		it("should reject 192.168.x.x URLs", () => {
			const result = validateWebhookUrl("http://192.168.1.1/webhook");
			expect(result).toBe(
				"Webhook URL cannot point to localhost or private IP addresses",
			);
		});
	});

	describe("SSRF prevention - cloud metadata endpoints", () => {
		it("should reject AWS metadata endpoint (blocked by link-local IP)", () => {
			// 169.254.169.254 is in the link-local range, so it's blocked by private IP check first
			const result = validateWebhookUrl(
				"http://169.254.169.254/latest/meta-data/",
			);
			expect(result).toBe(
				"Webhook URL cannot point to localhost or private IP addresses",
			);
		});

		it("should reject Google Cloud metadata endpoint", () => {
			const result = validateWebhookUrl(
				"http://metadata.google.internal/computeMetadata/v1/",
			);
			expect(result).toBe(
				"Webhook URL points to a blocked internal service",
			);
		});

		it("should reject Kubernetes internal endpoints", () => {
			const result = validateWebhookUrl(
				"http://kubernetes.default.svc/api/v1/",
			);
			expect(result).toBe(
				"Webhook URL points to a blocked internal service",
			);
		});
	});

	describe("credential prevention", () => {
		it("should reject URLs with username", () => {
			const result = validateWebhookUrl(
				"https://user@example.com/webhook",
			);
			expect(result).toBe("Webhook URL cannot contain credentials");
		});

		it("should reject URLs with password", () => {
			const result = validateWebhookUrl(
				"https://user:pass@example.com/webhook",
			);
			expect(result).toBe("Webhook URL cannot contain credentials");
		});
	});
});
