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
  const availableTokens =
    maxTotalTokens - systemTokens - maxOutputTokens - reservedTokens;

  const truncatedMessages = [...messages];
  let totalTokens = messages.reduce(
    (sum, msg) => sum + countMessageTokens(msg),
    0
  );

  // If we're under the limit, return all messages
  if (totalTokens <= availableTokens) {
    return truncatedMessages;
  }

  // Keep the first user message for context and last few messages
  const preserveCount = 4; // Keep last 4 messages minimum

  while (
    totalTokens > availableTokens &&
    truncatedMessages.length > preserveCount
  ) {
    // Remove messages from the middle, keeping the first and last few messages
    const removeIndex = Math.floor(truncatedMessages.length / 2);
    const removed = truncatedMessages.splice(removeIndex, 1)[0];
    if (removed) {
      totalTokens -= countMessageTokens(removed);
    }
  }

  // If we still need to remove messages and have more than minimum
  while (totalTokens > availableTokens && truncatedMessages.length > 2) {
    // Remove oldest messages after the first one
    const removed = truncatedMessages.splice(1, 1)[0];
    if (removed) {
      totalTokens -= countMessageTokens(removed);
    }
  }

  return truncatedMessages;
}
