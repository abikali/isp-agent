import { createAgent } from "./procedures/create-agent";
import { createChannel } from "./procedures/create-channel";
import { deleteAgent } from "./procedures/delete-agent";
import { deleteChannel } from "./procedures/delete-channel";
import { deleteMessage } from "./procedures/delete-message";
import { editMessage } from "./procedures/edit-message";
import { generateSystemPrompt } from "./procedures/generate-system-prompt";
import { getAgent } from "./procedures/get-agent";
import { getAgentStats } from "./procedures/get-agent-stats";
import { getConversationMessages } from "./procedures/get-conversation-messages";
import { getWebChatHistory } from "./procedures/get-web-chat-history";
import { listAgents } from "./procedures/list-agents";
import { listAllConversations } from "./procedures/list-all-conversations";
import { listChannels } from "./procedures/list-channels";
import { listConversations } from "./procedures/list-conversations";
import { listTools } from "./procedures/list-tools";
import { reactToMessage } from "./procedures/react-to-message";
import { searchConversationMessages } from "./procedures/search-conversation-messages";
import { sendAdminMessage } from "./procedures/send-admin-message";
import { sendWebChatMessage } from "./procedures/send-web-chat-message";
import { testTelegramConfig } from "./procedures/test-telegram-config";
import { togglePinConversation } from "./procedures/toggle-pin-conversation";
import { toggleWebChat } from "./procedures/toggle-web-chat";
import { updateAgent } from "./procedures/update-agent";
import { updateChannel } from "./procedures/update-channel";
import { updateToolConfig } from "./procedures/update-tool-config";
import { uploadChatAttachment } from "./procedures/upload-chat-attachment";
import { webChatInfo } from "./procedures/web-chat-info";

export const aiAgentsRouter = {
	createAgent,
	updateAgent,
	deleteAgent,
	listAgents,
	getAgent,
	generateSystemPrompt,
	createChannel,
	updateChannel,
	deleteChannel,
	listChannels,
	listConversations,
	listAllConversations,
	getConversationMessages,
	sendAdminMessage,
	reactToMessage,
	deleteMessage,
	editMessage,
	uploadChatAttachment,
	togglePinConversation,
	searchConversationMessages,
	getAgentStats,
	listTools,
	updateToolConfig,
	testTelegramConfig,
	webChatInfo,
	sendWebChatMessage,
	getWebChatHistory,
	toggleWebChat,
};
