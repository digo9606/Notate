import OpenAI from "openai";
import db from "../../db.js";
import { BrowserWindow } from "electron";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { truncateMessages } from "../llmHelpers/truncateMessages.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { returnSystemPrompt } from "../llmHelpers/returnSystemPrompt.js";
import { prepMessages } from "../llmHelpers/prepMessages.js";

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
  params: ProviderInputParams
): Promise<ProviderResponse> {
  const {
    messages,
    activeUser,
    userSettings,
    prompt,
    conversationId,
    mainWindow,
    currentTitle,
    collectionId,
    data,
    signal,
  } = params;
  const apiKey = db.getApiKey(activeUser.id, "deepseek");

  if (!apiKey) {
    throw new Error("DeepSeek API key not found for the active user");
  }

  await initializeDeepSeek(apiKey);

  if (!openai) {
    throw new Error("DeepSeek instance not initialized");
  }

  const maxOutputTokens = (userSettings.maxTokens as number) || 4096;
  const newMessages = await prepMessages(messages);
  let dataCollectionInfo;
  if (collectionId) {
    dataCollectionInfo = db.getCollection(collectionId) as Collection;
  }

  let reasoning;
  // Only do manual CoT if not using deepseek-reasoner
  if (userSettings.cot && !userSettings.model?.includes("deepseek-reasoner")) {
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
  const newSysPrompt = await returnSystemPrompt(
    prompt,
    dataCollectionInfo,
    reasoning || null,
    data
  );

  // Truncate messages to fit within token limits while preserving max output tokens
  const truncatedMessages = truncateMessages(newMessages, maxOutputTokens);
  truncatedMessages.unshift(newSysPrompt);

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

    if (mainWindow) {
      mainWindow.webContents.send("streamEnd");
    }

    return {
      id: conversationId,
      messages: [...messages, { ...newMessage, content: newMessage.content }],
      reasoning: reasoningContent || reasoning, // Use either deepseek-reasoner content or manual CoT reasoning
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
  const reasoning = await openai.chat.completions.create(
    {
      model: userSettings.model as string,
      messages: newMessages,
      stream: true,
      temperature: Number(userSettings.temperature),
      max_tokens: Number(maxOutputTokens),
    },
    { signal }
  );

  let reasoningContent = "";
  for await (const chunk of reasoning) {
    if (signal?.aborted) {
      throw new Error("AbortError");
    }
    const content = chunk.choices[0]?.delta?.content || "";
    reasoningContent += content;
    sendMessageChunk("[REASONING]: " + content, mainWindow);
  }

  return reasoningContent;
}
