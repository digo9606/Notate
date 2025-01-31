import { OpenAI } from "openai";
import { webSearch } from "./tools/websearch.js";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { BrowserWindow } from "electron";

export async function openAiAgent(
  provider: OpenAI,
  messages: ChatCompletionMessageParam[],
  maxOutputTokens: number,
  userSettings: UserSettings,
  signal?: AbortSignal,
  mainWindow: BrowserWindow | null = null
): Promise<{
  content: string;
  webSearchResult: {
    metadata: {
      title: string;
      source: string;
      description: string;
      author: string;
      keywords: string;
      ogImage: string;
    };
    textContent: string;
  } | null;
}> {
  sendMessageChunk("[Agent]: ", mainWindow);
  const sysPrompt: ChatCompletionMessageParam = {
    role: "system",
    content: `You are an AI Agent with the ability to visit websites and extract text and metadata. 
    Your task is to analyze the question and determine if visiting a website is needed. Respond with 
    a JSON object in this format: { webUrl: 0 or 1, url: 'url string if needed' }. Use webUrl: 1 if 
    visiting a website would help answer the question, and include the most relevant URL to visit. 
    Use webUrl: 0 if visiting a website is not needed.`,
  };

  const response = await provider.chat.completions.create(
    {
      model: userSettings.model as string,
      messages: [sysPrompt, ...messages],
      temperature: 0.1,
      max_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
    },
    { signal }
  );

  const content = response.choices[0]?.message?.content || "{}";

  const contentObj = JSON.parse(content) as { webUrl: number; url: string };

  let webSearchResult: {
    metadata: {
      title: string;
      source: string;
      description: string;
      author: string;
      keywords: string;
      ogImage: string;
    };
    textContent: string;
  } | null = null;

  if (contentObj.webUrl === 1) {
    webSearchResult = await webSearch({
      url: contentObj.url,
    });
  }
  sendMessageChunk("[REASONING]: " + content, mainWindow);
  sendMessageChunk("[Agent]: " + JSON.stringify(webSearchResult), mainWindow);
  return { content, webSearchResult };
}
