import OpenAI from "openai";
import db from "../../db.js";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { truncateMessages } from "../llmHelpers/truncateMessages.js";
import { returnSystemPrompt } from "../llmHelpers/returnSystemPrompt.js";
import { prepMessages } from "../llmHelpers/prepMessages.js";
import { openAiChainOfThought } from "../chainOfThought/openAiChainOfThought.js";

let openai: OpenAI;

async function initializeXAI(apiKey: string) {
  openai = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
}

export async function XAIProvider(
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

  const apiKey = db.getApiKey(activeUser.id, "xai");

  if (!apiKey) {
    throw new Error("XAI API key not found for the active user");
  }
  await initializeXAI(apiKey);

  if (!openai) {
    throw new Error("XAI instance not initialized");
  }

  const maxOutputTokens = (userSettings.maxTokens as number) || 4096;
  const newMessages = await prepMessages(messages);

  let dataCollectionInfo;
  if (collectionId) {
    dataCollectionInfo = db.getCollection(collectionId) as Collection;
  }

  let reasoning;
  if (userSettings.cot) {
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

  const sysPrompt = await returnSystemPrompt(
    prompt,
    dataCollectionInfo,
    reasoning || null,
    data
  );
  // Truncate messages to fit within token limits
  const truncatedMessages = truncateMessages(newMessages, maxOutputTokens);
  truncatedMessages.unshift(sysPrompt);

  const stream = await openai.chat.completions.create(
    {
      model: "grok-beta",
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

  try {
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

    return {
      id: conversationId,
      messages: [...messages, newMessage],
      title: currentTitle,
      reasoning: reasoning || "",
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
        title: currentTitle,
        reasoning: reasoning || "",
        content: "",
        aborted: true,
      };
    }
    throw error;
  }
}
