import { logger } from "@repo/logs";

export interface TelegramTestResult {
	botValid: boolean;
	botName: string | null;
	error: string | null;
	results: Array<{ chatId: string; success: boolean; error?: string }>;
}

const TELEGRAM_API = "https://api.telegram.org";

interface TelegramApiError {
	ok: false;
	error_code: number;
	description: string;
}

async function telegramRequest(
	botToken: string,
	method: string,
	body?: Record<string, unknown>,
): Promise<unknown> {
	const url = `${TELEGRAM_API}/bot${botToken}/${method}`;
	const response = await fetch(url, {
		method: body ? "POST" : "GET",
		headers: body ? { "Content-Type": "application/json" } : {},
		body: body ? JSON.stringify(body) : null,
	});

	const data = (await response.json()) as
		| { ok: true; result: unknown }
		| TelegramApiError;

	if (!data.ok) {
		const err = data as TelegramApiError;
		throw { error_code: err.error_code, description: err.description };
	}

	return (data as { ok: true; result: unknown }).result;
}

export async function testTelegramConfig(
	botToken: string,
	chatIds: string[],
): Promise<TelegramTestResult> {
	// Step 1: Validate bot token via getMe
	let botName = "";
	try {
		const me = (await telegramRequest(botToken, "getMe")) as {
			username?: string;
			first_name: string;
		};
		botName = me.username ?? me.first_name;
	} catch (error) {
		logger.warn("Telegram bot token validation failed", { error });

		const apiErr = error as { error_code?: number; description?: string };
		if (apiErr.error_code) {
			return {
				botValid: false,
				botName: null,
				error: `Invalid bot token: ${apiErr.description}`,
				results: [],
			};
		}
		return {
			botValid: false,
			botName: null,
			error: "Network error: could not reach Telegram API",
			results: [],
		};
	}

	// Step 2: Send a test message to each chat ID
	const results: Array<{
		chatId: string;
		success: boolean;
		error?: string;
	}> = [];

	const testMessage = `This is a test message from LibanCom AI Agent configuration.\n\nBot: @${botName}`;

	await Promise.allSettled(
		chatIds.map(async (chatId) => {
			try {
				await telegramRequest(botToken, "sendMessage", {
					chat_id: Number(chatId),
					text: testMessage,
				});
				results.push({ chatId, success: true });
			} catch (error) {
				const apiErr = error as {
					error_code?: number;
					description?: string;
				};
				let errorMsg = "Unknown error";
				if (apiErr.error_code === 403) {
					errorMsg =
						"Bot was blocked by this user, or user has not started a conversation with the bot. Ask them to send /start to the bot first.";
				} else if (apiErr.error_code === 400) {
					errorMsg =
						"Chat not found. Verify the Chat ID is correct and that the user has sent /start to the bot.";
				} else if (apiErr.description) {
					errorMsg = apiErr.description;
				}
				results.push({ chatId, success: false, error: errorMsg });
			}
		}),
	);

	return {
		botValid: true,
		botName,
		error: null,
		results,
	};
}
