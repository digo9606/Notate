import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { BrowserWindow } from "electron";
import { zodToJsonSchema } from "zod-to-json-schema";
import ollama from "ollama";
import { z } from "zod";
import { webSearch } from "./tools/websearch.js";

export async function ollamaAgent(
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
  console.log("ollamaAgent");
  sendMessageChunk("[Agent]: ", mainWindow);
  const sysPrompt: ChatCompletionMessageParam = {
    role: "system",
    content: `You are an AI Agent with the ability to visit websites and extract text and metadata. 
    Your task is to analyze the question and determine if visiting a website is needed. Respond with 
    a JSON object in this format: { webUrl: 0 or 1, url: 'url string if needed' }. Use webUrl: 1 if 
    visiting a website would help answer the question, and include the most relevant URL to visit. 
    Use webUrl: 0 if visiting a website is not needed.`,
  };

  const AgentActions = z.object({
    webUrl: z.number(),
    url: z.string(),
  });

  type OllamaMessage = { role: string; content: string };
  const convertToOllamaMessages = (
    msgs: ChatCompletionMessageParam[]
  ): OllamaMessage[] =>
    msgs.map((msg) => ({
      role: msg.role,
      content: msg.content
        ? typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content) &&
            msg.content[0] &&
            "text" in msg.content[0]
          ? msg.content[0].text
          : ""
        : "",
    }));

  const response = await ollama.chat({
    model: userSettings.model || "llama2",
    messages: convertToOllamaMessages([sysPrompt, ...messages]),
    format: zodToJsonSchema(AgentActions),
  });

  const agentActions = AgentActions.parse(JSON.parse(response.message.content));

  let webSearchResult;
  if (agentActions.webUrl === 1) {
    webSearchResult = await webSearch({
      url: agentActions.url,
    });
  }
  console.log("agentActions", agentActions);
  sendMessageChunk(
    "[REASONING]: " + "Visiting website: " + agentActions.url,
    mainWindow
  );
  console.log("webSearchResult", webSearchResult);
  sendMessageChunk("[Agent]: " + JSON.stringify(webSearchResult), mainWindow);
  return {
    content: "Visiting website: " + agentActions.url,
    webSearchResult: webSearchResult || null,
  };
}
