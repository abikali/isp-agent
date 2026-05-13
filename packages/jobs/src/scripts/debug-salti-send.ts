/** biome-ignore-all lint/suspicious/noConsole: this is a CLI debug script */
/**
 * Debug script: send a single template via Salti to a hard-coded phone with a
 * caller-supplied media URL, then print the raw Salti response.
 *
 * Use it to prove that:
 *   - a real public media URL delivers the message (vs. Meta's preview handle
 *     `scontent.whatsapp.net/...` which Salti accepts but never delivers).
 *
 * Run on the prod host (env is already set there):
 *   tsx packages/jobs/src/scripts/debug-salti-send.ts <orgIdOrSlug> <templateName> <templateLang> <mediaUrl>
 *
 * Example:
 *   tsx packages/jobs/src/scripts/debug-salti-send.ts libancom offer2_get1client_free en_US https://picsum.photos/800
 */
import { decryptToken } from "@repo/ai";
import { db } from "@repo/database";
import { createSaltiClient } from "@repo/integrations";

const TARGET_PHONE = "96170442737";

async function main() {
	const [orgArg, templateName, templateLang, mediaUrl] =
		process.argv.slice(2);
	if (!orgArg || !templateName || !templateLang || !mediaUrl) {
		console.error(
			"usage: debug-salti-send <orgIdOrSlug> <templateName> <templateLang> <mediaUrl>",
		);
		process.exit(1);
	}

	const organization = await db.organization.findFirst({
		where: { OR: [{ id: orgArg }, { slug: orgArg }] },
		select: { id: true, slug: true, name: true },
	});
	if (!organization) {
		console.error(`organization not found for "${orgArg}"`);
		process.exit(1);
	}

	const integration = await db.saltiIntegration.findUnique({
		where: { organizationId: organization.id },
	});
	if (!integration) {
		console.error(
			`no SaltiIntegration row for org ${organization.slug} (${organization.id})`,
		);
		process.exit(1);
	}

	const client = createSaltiClient({
		endpoint: integration.apiEndpoint,
		token: decryptToken(integration.encryptedApiToken),
	});

	console.log(
		`[debug-salti-send] org=${organization.slug} template=${templateName}/${templateLang} phone=${TARGET_PHONE}`,
	);
	console.log(`[debug-salti-send] media url=${mediaUrl}`);

	const result = await client.sendTemplateMessage({
		phone: TARGET_PHONE,
		template_name: templateName,
		template_language: templateLang,
		components: [
			{
				type: "header",
				parameters: [{ type: "image", image: { link: mediaUrl } }],
			},
		],
	});

	console.log("[debug-salti-send] raw response:");
	console.log(JSON.stringify(result, null, 2));

	await db.$disconnect();
}

main().catch((error) => {
	console.error("[debug-salti-send] failed:", error);
	process.exit(1);
});
