import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { sendMessageChunk } from "../llmHelpers/sendMessageChunk.js";
import { BrowserWindow } from "electron";
import { z } from "zod";
import { webSearch } from "./tools/websearch.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function geminiAgent(
  gemini: GoogleGenerativeAI,
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
  const sysPrompt = `You are an AI Agent with the ability to visit websites and extract text and metadata. 
    Your task is to analyze the user's question and determine if visiting a website would help answer it.
    
    If web search would be helpful, respond with EXACTLY this JSON format without any markdown formatting or code blocks:
    {
      "webUrl": 1,
      "url": "full_url_here"
    }
    
    If web search is not needed, respond with EXACTLY without any markdown formatting or code blocks:
    {
      "webUrl": 0,
      "url": ""
    }
    
    Only respond with one of these two JSON formats, nothing else.
    Do not wrap the response in markdown code blocks or add any other formatting.
    Make sure the URL is a complete, valid URL starting with http:// or https://
    Do not include any explanation or additional text in your response.`;

  const AgentActions = z.object({
    webUrl: z.number(),
    url: z.string(),
  });

  const model = gemini.getGenerativeModel({
    model: userSettings.model as string,
  });

  const chat = model.startChat({
    history: [],
    generationConfig: {
      temperature: Number(userSettings.temperature),
      maxOutputTokens: maxOutputTokens,
    },
  });

  const result = await chat.sendMessage(
    sysPrompt + "\n\n" + messages[messages.length - 1].content
  );
  const responseText = result.response.text();

  let agentActions;
  try {
    // Clean up markdown formatting if present
    const cleanedResponse = responseText
      .replace(/```json\n?/g, "") // Remove ```json
      .replace(/```\n?/g, "") // Remove closing ```
      .trim(); // Remove extra whitespace

    agentActions = AgentActions.parse(JSON.parse(cleanedResponse));
  } catch (error) {
    console.error("Failed to parse agent response:", error);
    console.log("Raw response:", responseText); // Add logging for debugging
    // Fallback to no web search if parsing fails
    agentActions = { webUrl: 0, url: "" };
  }

  let webSearchResult = null;
  if (agentActions.webUrl === 1 && agentActions.url) {
    try {
      webSearchResult = await webSearch({
        url: agentActions.url,
      });
      sendMessageChunk(
        "[REASONING]: Visiting website: " + agentActions.url + "\n",
        mainWindow
      );
    } catch (error) {
      console.error("Web search failed:", error);
      sendMessageChunk(
        "[REASONING]: Failed to visit website: " + agentActions.url + "\n",
        mainWindow
      );
    }
  }

  // Prepare final response
  const finalResponse = {
    content: webSearchResult
      ? `Retrieved content from: ${agentActions.url}`
      : "No web search was needed or the search failed",
    webSearchResult,
  };

  return finalResponse;
}
