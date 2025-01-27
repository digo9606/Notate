import OpenAI from "openai";
import db from "../../db.js";
import { BrowserWindow } from "electron";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { truncateMessages } from "../llmHelpers/truncateMessages.js";

interface DeepSeekDelta
  extends OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta {
  reasoning_content?: string;
}

let openai: OpenAI;

async function initializeDeepSeek(apiKey: string) {
  openai = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
    defaultHeaders: {
      "HTTP-Referer": "https://notate.hairetsu.com",
      "X-Title": "Notate",
    },
  });
}

export async function DeepSeekProvider(
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
  } | null,
  signal?: AbortSignal
) {
  const apiKey = db.getApiKey(activeUser.id, "deepseek");

  if (!apiKey) {
    throw new Error("DeepSeek API key not found for the active user");
  }

  await initializeDeepSeek(apiKey);

  if (!openai) {
    throw new Error("DeepSeek instance not initialized");
  }

  const newMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
  let dataCollectionInfo;
  if (collectionId) {
    dataCollectionInfo = db.getCollection(collectionId) as Collection;
  }
  const sysPrompt: {
    role: "system";
    content: string;
  } = {
    role: "system",
    content:
      "When asked about previous messages, only consider messages marked as '(most recent message)' as the last message. " +
      prompt +
      (data
        ? "The following is the data that the user has provided via their custom data collection: " +
          `\n\n${JSON.stringify(data)}` +
          `\n\nCollection/Store Name: ${dataCollectionInfo?.name}` +
          `\n\nCollection/Store Files: ${dataCollectionInfo?.files}` +
          `\n\nCollection/Store Description: ${dataCollectionInfo?.description}`
        : ""),
  };
  const maxOutputTokens = (userSettings.maxTokens as number) || 4096;
  const truncatedMessages = truncateMessages(
    newMessages,
    sysPrompt,
    maxOutputTokens
  );
  truncatedMessages.unshift(sysPrompt);

  const stream = await openai.chat.completions.create(
    {
      model: userSettings.model as string,
      messages: truncatedMessages,
      stream: true,
      temperature: Number(userSettings.temperature),
      max_tokens: maxOutputTokens,
    },
    { signal }
  );

  const newMessage: Message = {
    role: "assistant",
    content: "",
    timestamp: new Date(),
    data_content: data ? JSON.stringify(data) : undefined,
  };

  let reasoningContent = "";

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }

      const delta = chunk.choices[0]?.delta as DeepSeekDelta;

      if (delta?.reasoning_content) {
        reasoningContent += delta.reasoning_content;
        sendMessageChunk("[REASONING]:" + delta.reasoning_content, mainWindow);
      } else if (delta?.content) {
        const content = delta.content;
        newMessage.content += content;
        sendMessageChunk(content, mainWindow);
      }
    }

    if (reasoningContent) {
      // Don't append reasoning to content anymore
      // newMessage.content = "[REASONING]:" + reasoningContent + "\n\n" + newMessage.content;
    }

    if (mainWindow) {
      mainWindow.webContents.send("streamEnd");
    }

    return {
      id: conversationId,
      messages: [...messages, { ...newMessage, content: newMessage.content }],
      reasoning: reasoningContent,
      title: currentTitle,
      content: newMessage.content,
      aborted: false,
    };
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.message === "AbortError")
    ) {
      return {
        id: conversationId,
        messages: messages,
        reasoning: reasoningContent,
        title: currentTitle,
        content: "",
        aborted: true,
      };
    }
    throw error;
  }
}
