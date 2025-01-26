import db from "../../db.js";
import Anthropic from "@anthropic-ai/sdk";
import { BrowserWindow } from "electron";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { truncateMessages } from "../llmHelpers/truncateMessages.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export async function AnthropicProvider(
  messages: Message[],
  activeUser: User,
  userSettings: UserSettings,
  prompt: string,
  conversationId: bigint | number,
  mainWindow: BrowserWindow | null = null,
  currentTitle: string,
  collectionId?: number,
  data?: {
    top_k: number;
    results: {
      content: string;
      metadata: string;
    }[];
  },
  signal?: AbortSignal
): Promise<{
  id: bigint | number;
  messages: Message[];
  title: string;
  content: string;
  aborted: boolean;
}> {
  const apiKey = db.getApiKey(activeUser.id, "anthropic");
  if (!apiKey) {
    throw new Error("Anthropic API key not found for the active user");
  }
  const anthropic = new Anthropic({ apiKey });

  const newMessage: Message = {
    role: "assistant",
    content: "",
    timestamp: new Date(),
    data_content: data ? JSON.stringify(data) : undefined,
  };

  const newMessages = messages.map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
  })) as ChatCompletionMessageParam[];

  let dataCollectionInfo;
  if (collectionId) {
    dataCollectionInfo = db.getCollection(collectionId) as Collection;
  }

  const sysPrompt: ChatCompletionMessageParam = {
    role: "system",
    content:
      "When asked about previous messages, only consider messages marked as '(most recent message)' as the last message. Respond in a beautiful markdown format for anything non-code. " +
      prompt +
      (data
        ? "The following is the data that the user has provided via their custom data collection: " +
          `\n\n${JSON.stringify(data)}` +
          `\n\nCollection/Store Name: ${dataCollectionInfo?.name}` +
          `\n\nCollection/Store Files: ${dataCollectionInfo?.files}` +
          `\n\nCollection/Store Description: ${dataCollectionInfo?.description}`
        : ""),
  };

  // Truncate messages to fit within token limits
  const maxOutputTokens = (userSettings.maxTokens as number) || 4096;
  const truncatedMessages = truncateMessages(
    newMessages,
    sysPrompt,
    maxOutputTokens
  );

  const stream = (await anthropic.messages.stream(
    {
      temperature: Number(userSettings.temperature),
      system: sysPrompt.content,
      messages: truncatedMessages.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content as string,
      })),
      model: userSettings.model as string,
      max_tokens: Number(maxOutputTokens),
    },
    { signal }
  )) as unknown as {
    type: string;
    delta: { text: string };
  }[];

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      if (chunk.type === "content_block_delta") {
        const content = chunk.delta.text;
        newMessage.content += content;
        sendMessageChunk(content, mainWindow);
      }
    }

    if (mainWindow) {
      mainWindow.webContents.send("streamEnd");
    }

    return {
      id: conversationId,
      messages: [...messages, newMessage],
      title: currentTitle,
      content: newMessage.content,
      aborted: false,
    };
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.message === "AbortError")
    ) {
      if (mainWindow) {
        mainWindow.webContents.send("streamEnd");
      }
      return {
        id: conversationId,
        messages: [...messages, { ...newMessage }],
        title: currentTitle,
        content: newMessage.content,
        aborted: true,
      };
    }
    throw error;
  }
}
