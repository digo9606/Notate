import { BrowserWindow } from "electron";
import db from "../../db.js";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { truncateMessages } from "../llmHelpers/truncateMessages.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export async function OllamaProvider(
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
  let dataCollectionInfo;
  if (collectionId) {
    dataCollectionInfo = db.getCollection(collectionId) as Collection;
  }

  // Truncate messages to fit within token limits
  const maxOutputTokens = (userSettings.maxTokens as number) || 4096;

  // Sort messages by timestamp to ensure proper chronological order
  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeA - timeB; // Oldest first
  });

  // Add timestamp context to messages
  const newMessages = sortedMessages.map((msg, index) => {
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
  }) as ChatCompletionMessageParam[];

  let reasoning;
  if (userSettings.cot) {
    // Do reasoning first
    reasoning = await chainOfThought(
      newMessages,
      maxOutputTokens,
      userSettings,
      "", // Empty prompt for pure reasoning
      data ? data : null,
      dataCollectionInfo ? dataCollectionInfo : null,
      signal,
      mainWindow
    );

    // Send end of reasoning marker
    if (mainWindow) {
      mainWindow.webContents.send("reasoningEnd");
    }
  }

  const newSysPrompt: ChatCompletionMessageParam = {
    role: "system",
    content:
      prompt +
      (reasoning
        ? "\n\nUse this reasoning process to guide your response: " +
          reasoning +
          "\n\n"
        : "") +
      (data
        ? "The following is the data that the user has provided via their custom data collection: " +
          `\n\n${JSON.stringify(data)}` +
          `\n\nCollection/Store Name: ${dataCollectionInfo?.name}` +
          `\n\nCollection/Store Files: ${dataCollectionInfo?.files}` +
          `\n\nCollection/Store Description: ${dataCollectionInfo?.description}` +
          `\n\n*** THIS IS THE END OF THE DATA COLLECTION ***`
        : ""),
  };

  const truncatedMessages = truncateMessages(newMessages, maxOutputTokens);
  truncatedMessages.unshift(newSysPrompt);

  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: userSettings.model || "llama2",
      messages: truncatedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content as string,
      })),
      stream: true,
      keep_alive: -1,
      max_tokens: maxOutputTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama API error: ${response.status} ${response.statusText}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader");
  }

  const newMessage: Message = {
    role: "assistant",
    content: "",
    timestamp: new Date(),
    data_content: data ? JSON.stringify(data) : undefined,
  };

  try {
    let buffer = "";
    while (true) {
      if (signal?.aborted) {
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

      const { done, value } = await reader.read();
      if (done) break;

      // Add new data to buffer and split by newlines
      buffer += new TextDecoder().decode(value);
      const lines = buffer.split("\n");

      // Process all complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            newMessage.content += parsed.message.content;
            sendMessageChunk(parsed.message.content, mainWindow);
          }
        } catch (e) {
          console.warn("Failed to parse line:", line, e);
        }
      }

      // Keep the last incomplete line in the buffer
      buffer = lines[lines.length - 1];
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.message?.content) {
          newMessage.content += parsed.message.content;
          sendMessageChunk(parsed.message.content, mainWindow);
        }
      } catch (e) {
        console.warn("Failed to parse final buffer:", buffer, e);
      }
    }

    if (mainWindow) {
      mainWindow.webContents.send("streamEnd");
    }

    // Only return message if we have content and weren't aborted
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
      reasoning: reasoning || "",
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
      if (mainWindow) {
        mainWindow.webContents.send("streamEnd");
      }
      return {
        id: conversationId,
        messages: [...messages, { ...newMessage }],
        title: currentTitle,
        content: newMessage.content,
        reasoning: reasoning || "",
        aborted: true,
      };
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function chainOfThought(
  messages: ChatCompletionMessageParam[],
  maxOutputTokens: number,
  userSettings: UserSettings,
  prompt: string,
  data: {
    top_k: number;
    results: {
      content: string;
      metadata: string;
    }[];
  } | null,
  dataCollectionInfo: Collection | null,
  signal?: AbortSignal,
  mainWindow: BrowserWindow | null = null
) {
  const sysPrompt: ChatCompletionMessageParam = {
    role: "system",
    content:
      "You are a reasoning engine. Your task is to analyze the question and outline your step-by-step reasoning process for how to answer it. Keep your reasoning concise and focused on the key logical steps. Only return the reasoning process, do not provide the final answer." +
      (data
        ? "The following is the data that the user has provided via their custom data collection: " +
          `\n\n${JSON.stringify(data)}` +
          `\n\nCollection/Store Name: ${dataCollectionInfo?.name}` +
          `\n\nCollection/Store Files: ${dataCollectionInfo?.files}` +
          `\n\nCollection/Store Description: ${dataCollectionInfo?.description}` +
          `\n\n*** THIS IS THE END OF THE DATA COLLECTION ***`
        : ""),
  };

  const truncatedMessages = truncateMessages(messages, maxOutputTokens);
  const newMessages = [sysPrompt, ...truncatedMessages];

  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: userSettings.model || "llama2",
      messages: newMessages.map((msg) => ({
        role: msg.role,
        content: msg.content as string,
      })),
      stream: true,
      keep_alive: -1,
      max_tokens: maxOutputTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama API error: ${response.status} ${response.statusText}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader");
  }

  let reasoningContent = "";
  try {
    let buffer = "";
    while (true) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      // Add new data to buffer and split by newlines
      buffer += new TextDecoder().decode(value);
      const lines = buffer.split("\n");

      // Process all complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            reasoningContent += parsed.message.content;
            sendMessageChunk(
              "[REASONING]: " + parsed.message.content,
              mainWindow
            );
          }
        } catch (e) {
          console.warn("Failed to parse line:", line, e);
        }
      }

      // Keep the last incomplete line in the buffer
      buffer = lines[lines.length - 1];
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.message?.content) {
          reasoningContent += parsed.message.content;
          sendMessageChunk(
            "[REASONING]: " + parsed.message.content,
            mainWindow
          );
        }
      } catch (e) {
        console.warn("Failed to parse final buffer:", buffer, e);
      }
    }

    return reasoningContent;
  } finally {
    reader.releaseLock();
  }
}
