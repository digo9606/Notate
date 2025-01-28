import OpenAI from "openai";
import db from "../../db.js";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { truncateMessages } from "../llmHelpers/truncateMessages.js";
import { returnSystemPrompt } from "../llmHelpers/returnSystemPrompt.js";
import { prepMessages } from "../llmHelpers/prepMessages.js";
import { openAiChainOfThought } from "../chainOfThought/openAiChainOfThought.js";

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
    reasoning = await openAiChainOfThought(
      openai,
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
