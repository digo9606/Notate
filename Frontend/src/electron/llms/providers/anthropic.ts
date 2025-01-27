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
  reasoning: string;
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
  const maxOutputTokens = (userSettings.maxTokens as number) || 4096;

  async function chainOfThought(
    messages: ChatCompletionMessageParam[],
    maxOutputTokens: number,
    userSettings: UserSettings,
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
    const sysPrompt =
      "You are a reasoning engine. Your task is to analyze the question and outline your step-by-step reasoning process for how to answer it. Keep your reasoning concise and focused on the key logical steps. Only return the reasoning process, do not provide the final answer." +
      (data
        ? "The following is the data that the user has provided via their custom data collection: " +
          `\n\n${JSON.stringify(data)}` +
          `\n\nCollection/Store Name: ${dataCollectionInfo?.name}` +
          `\n\nCollection/Store Files: ${dataCollectionInfo?.files}` +
          `\n\nCollection/Store Description: ${dataCollectionInfo?.description}` +
          `\n\n*** THIS IS THE END OF THE DATA COLLECTION ***`
        : "");

    const truncatedMessages = truncateMessages(messages, maxOutputTokens);

    const stream = await anthropic.messages.stream(
      {
        messages: truncatedMessages.map((msg) => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content as string,
        })),
        system: sysPrompt,
        model: userSettings.model as string,
        max_tokens: Number(maxOutputTokens),
        temperature: Number(userSettings.temperature),
      },
      { signal }
    );

    let reasoningContent = "";
    try {
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new Error("AbortError");
        }
        if (chunk.type === "content_block_delta") {
          const content = "text" in chunk.delta ? chunk.delta.text : "";
          reasoningContent += content;
          sendMessageChunk("[REASONING]: " + content, mainWindow);
        }
      }
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof Error && error.message === "AbortError")
      ) {
        throw error;
      }
    }

    return reasoningContent;
  }

  let reasoning;
  if (userSettings.cot) {
    // Do reasoning first
    reasoning = await chainOfThought(
      newMessages,
      maxOutputTokens,
      userSettings,
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

  const sysPrompt: ChatCompletionMessageParam = {
    role: "system",
    content:
      "When asked about previous messages, only consider messages marked as '(most recent message)' as the last message. " +
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
          `\n\nCollection/Store Description: ${dataCollectionInfo?.description}`
        : ""),
  };

  // Truncate messages to fit within token limits
  const truncatedMessages = truncateMessages(newMessages, maxOutputTokens);

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
        const content = "text" in chunk.delta ? chunk.delta.text : "";
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
      reasoning: reasoning || "",
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
        reasoning: reasoning || "",
        aborted: true,
      };
    }
    throw error;
  }
}
