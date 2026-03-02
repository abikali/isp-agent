import { logger } from "@repo/logs";

export interface TelegramTestResult {
	botValid: boolean;
	botName: string | null;
	error: string | null;
	results: Array<{ chatId: string; success: boolean; error?: string }>;
}

export async function testTelegramConfig(
	botToken: string,
	chatIds: string[],
): Promise<TelegramTestResult> {
	const { Api, GrammyError, HttpError } = await import("grammy");
	const api = new Api(botToken);

	// Step 1: Validate bot token via getMe
	let botName = "";
	try {
		const me = await api.getMe();
		botName = me.username ?? me.first_name;
	} catch (error) {
		logger.warn("Telegram bot token validation failed", { error });

		if (error instanceof GrammyError) {
			return {
				botValid: false,
				botName: null,
				error: `Invalid bot token: ${error.description}`,
				results: [],
			};
		}
		if (error instanceof HttpError) {
			return {
				botValid: false,
				botName: null,
				error: "Network error: could not reach Telegram API",
				results: [],
			};
		}
		return {
			botValid: false,
			botName: null,
			error: "Failed to validate bot token",
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
				await api.sendMessage(Number(chatId), testMessage);
				results.push({ chatId, success: true });
			} catch (error) {
				let errorMsg = "Unknown error";
				if (error instanceof GrammyError) {
					if (error.error_code === 403) {
						errorMsg =
							"Bot was blocked by this user, or user has not started a conversation with the bot. Ask them to send /start to the bot first.";
					} else if (error.error_code === 400) {
						errorMsg =
							"Chat not found. Verify the Chat ID is correct and that the user has sent /start to the bot.";
					} else {
						errorMsg = error.description;
					}
				} else if (error instanceof HttpError) {
					errorMsg = "Network error: could not reach Telegram";
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
