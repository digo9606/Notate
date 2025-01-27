import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { countMessageTokens } from "./countMessageTokens.js";

// Helper function to truncate messages to fit within token limit
export function truncateMessages(
  messages: ChatCompletionMessageParam[],
  systemPrompt: ChatCompletionMessageParam,
  maxOutputTokens: number,
  maxTotalTokens: number = 4096
): ChatCompletionMessageParam[] {
  const reservedTokens = 3; // Few tokens reserved for formatting

  const systemTokens = countMessageTokens(systemPrompt);
  let totalTokens = messages.reduce(
    (sum, msg) => sum + countMessageTokens(msg),
    0
  );

  // Calculate available tokens for conversation
  const availableTokens = maxTotalTokens - maxOutputTokens / 2 - reservedTokens;
  const currentTokens = totalTokens + systemTokens;

  // If we're under the limit, return all messages unchanged
  if (currentTokens <= availableTokens) {
    return messages;
  }

  // Only truncate if we're actually over the total token limit
  const truncatedMessages = [...messages];

  // Remove oldest messages first until we're under the limit
  while (currentTokens > availableTokens && truncatedMessages.length > 2) {
    // Remove oldest messages first, keeping at least the last 2 messages
    const removed = truncatedMessages.shift();
    if (removed) {
      totalTokens -= countMessageTokens(removed);
    }
  }

  return truncatedMessages;
}
