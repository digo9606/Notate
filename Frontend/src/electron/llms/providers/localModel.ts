import { BrowserWindow } from "electron";
import db from "../../db.js";
import { truncateMessages } from "../llmHelpers/truncateMessages.js";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import OpenAI from "openai";
import { getToken } from "../../authentication/token.js";

let openai: OpenAI;

function initializeLocalOpenAI(apiKey: string) {
  openai = new OpenAI({
    baseURL: "http://127.0.0.1:47372",
    apiKey: apiKey,
  });
}

export async function LocalModelProvider(
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
) {
  const apiKey = await getToken({ userId: activeUser.id.toString() });
  if (!openai) {
    initializeLocalOpenAI(apiKey);
  }

  // Sort messages by timestamp to ensure proper chronological order
  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeA - timeB; // Oldest first
  });

  // Add timestamp context to messages
  const newMessages: ChatCompletionMessageParam[] = sortedMessages.map(
    (msg, index) => {
      const isLastMessage = index === sortedMessages.length - 1;
      const timeStr = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString()
        : "";
      let content = msg.content;

      // Only add context to user messages
      if (msg.role === "user") {
        content = `[${timeStr}] ${content}${
          isLastMessage ? " (most recent message)" : ""
        }`;
      }

      return {
        role: msg.role as "user" | "assistant" | "system",
        content: content,
      };
    }
  );

  let dataCollectionInfo;
  if (collectionId) {
    dataCollectionInfo = db.getCollection(collectionId) as Collection;
  }

  const sysPrompt: ChatCompletionMessageParam = {
    role: "system",
    content:
      " When asked about previous messages, only consider messages marked as '(most recent message)' as the last message. Respond in a beautiful markdown format for anything non-code.  " +
      prompt +
      (data
        ? "The following is the data that the user has provided via their custom data collection: " +
          `\n\n${JSON.stringify(data)}` +
          `\n\nCollection/Store Name: ${dataCollectionInfo?.name}` +
          `\n\nCollection/Store Files: ${dataCollectionInfo?.files}` +
          `\n\nCollection/Store Description: ${dataCollectionInfo?.description}` +
          `\n\n*** THIS IS THE END OF THE DATA COLLECTION ***`
        : ""),
  };

  // Truncate messages to fit within token limits
  const maxOutputTokens = (userSettings.maxTokens as number) || 4096;
  const truncatedMessages = truncateMessages(
    newMessages,
    sysPrompt,
    maxOutputTokens
  );
  truncatedMessages.unshift(sysPrompt);

  const newMessage: Message = {
    role: "assistant",
    content: "",
    timestamp: new Date(),
    data_content: data ? JSON.stringify(data) : undefined,
  };

  try {
    const stream = await openai.chat.completions.create(
      {
        model: userSettings.model || "",
        messages: truncatedMessages,
        stream: true,
        temperature: Number(userSettings.temperature) || 0.7,
        max_tokens: Number(maxOutputTokens),
        top_p: Number(userSettings.topP) || 0.95,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      const content = chunk.choices[0]?.delta?.content || "";
      newMessage.content += content;
      sendMessageChunk(content, mainWindow);
    }

    if (mainWindow) {
      mainWindow.webContents.send("streamEnd");
    }

    if (newMessage.content) {
      return {
        id: conversationId,
        messages: [...messages, newMessage],
        title: currentTitle,
        content: newMessage.content,
        aborted: false,
      };
    }

    return {
      id: conversationId,
      messages: messages,
      title: currentTitle,
      content: "",
      aborted: false,
    };
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send("streamEnd");
    }

    if (
      signal?.aborted ||
      (error instanceof Error && error.message === "AbortError")
    ) {
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
