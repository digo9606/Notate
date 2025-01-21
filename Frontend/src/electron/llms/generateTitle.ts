import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import OpenAI from "openai";
import { AzureOpenAI } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getToken } from "../authentication/token.js";

const titleMessages = (input: string): OpenAI.ChatCompletionMessageParam[] => [
  {
    role: "system" as const,
    content:
      "Generate a short, concise title (5 words or less) for a conversation based on the following message: Return the Title only and nothing else example response: 'Meeting with John' Return: 'Meeting with John'",
  },
  { role: "user" as const, content: input },
];

async function generateTitleOpenRouter(input: string, userId: number) {
  let apiKey = "";
  try {
    apiKey = db.getApiKey(userId, "openrouter");
  } catch (error) {
    console.error("Error getting API key:", error);
  }
  if (!apiKey) {
    throw new Error("OpenRouter API key not found for the active user");
  }
  const openai = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });
  const llmTitleRequest = await openai.chat.completions.create({
    model: "openai/gpt-3.5-turbo",
    messages: titleMessages(input),
    max_tokens: 20,
  });

  const generatedTitle = llmTitleRequest.choices[0]?.message?.content?.trim();
  return generatedTitle;
}

async function generateTitleCustom(
  input: string,
  userId: number,
  customAPI: number,
  userSettings: UserSettings
) {
  console.log("Generating title for custom API:", customAPI);
  const customApis = db.getCustomAPI(userId);
  if (customApis.length == 0) {
    throw new Error("No custom API selected");
  }
  const api = customApis.find((api) => api.id == customAPI);
  if (!customAPI) {
    throw new Error("Custom API not found");
  }
  if (!api) {
    throw new Error("Custom API not found");
  }
  const openai = new OpenAI({
    apiKey: api.api_key,
    baseURL: api.endpoint,
  });
  const stream = await openai.chat.completions.create({
    model: userSettings.model || "",
    messages: titleMessages(input),
    stream: true,
    temperature: 0.7,
    max_tokens: 20,
    top_p: 0.95,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
  });
  let generatedTitle = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    generatedTitle += content;
  }
  return generatedTitle;
}

async function generateTitleAnthropic(input: string, userId: number) {
  let apiKey = "";
  try {
    apiKey = db.getApiKey(userId, "anthropic");
  } catch (error) {
    console.error("Error getting API key:", error);
  }
  if (!apiKey) {
    throw new Error("Anthropic API key not found for the active user");
  }
  const anthropic = new Anthropic({ apiKey });
  const llmTitleRequest = (await anthropic.messages.create({
    model: "claude-3-sonnet-20240229",
    max_tokens: 20,
    system:
      "Generate a short, concise title (5 words or less) for a conversation based on the following message: Return the Title only and nothing else example response: 'Meeting with John' Return: 'Meeting with John'",
    messages: [
      {
        role: "user",
        content: input,
      },
    ],
  })) as unknown as {
    content: { text: string }[];
  };

  const generatedTitle = llmTitleRequest.content[0].text;
  return generatedTitle || "New Conversation";
}

async function generateTitleGemini(input: string, userId: number) {
  let apiKey = "";
  try {
    apiKey = db.getApiKey(userId, "gemini");
  } catch (error) {
    console.error("Error getting API key:", error);
  }
  if (!apiKey) {
    throw new Error("Gemini API key not found for the active user");
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const titleResult = await model.generateContent(
    "Generate a short, concise title (5 words or less) for a conversation based on the following message: Return the Title only and nothing else example response: 'Meeting with John' Return: 'Meeting with John'\n\n" +
      input
  );
  const generatedTitle = titleResult.response.text().trim();

  return generatedTitle ?? "New Conversation";
}

async function generateTitleXAI(input: string, userId: number) {
  let apiKey = "";
  try {
    apiKey = db.getApiKey(userId, "xai");
  } catch (error) {
    console.error("Error getting API key:", error);
  }
  if (!apiKey) {
    throw new Error("XAI API key not found for the active user");
  }
  const openai = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
  const messages = titleMessages(input);
  const llmTitleRequest = await openai.chat.completions.create({
    model: "grok-beta",
    messages: messages,
    max_tokens: 20,
  });

  const generatedTitle = llmTitleRequest.choices[0]?.message?.content?.trim();
  return generatedTitle;
}

async function generateOllamaTitle(input: string, model: string) {
  try {
    const messages = titleMessages(input);
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false, // Disable streaming to get a single response
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}`
      );
    }

    const text = await response.text();
    // Ollama returns one JSON object per line
    const lines = text.split("\n").filter((line) => line.trim());
    const lastLine = lines[lines.length - 1];
    const lastResponse = JSON.parse(lastLine);
    if (!lastResponse.message?.content) {
      console.warn("Empty response from Ollama:", lastResponse);
      return "New Conversation";
    }

    return lastResponse.message.content.trim() || "New Conversation";
  } catch (error) {
    console.error("Error generating title:", error);
    return "New Conversation";
  }
}

async function generateTitleOpenAI(input: string, userId: number) {
  let apiKey = "";
  try {
    apiKey = db.getApiKey(userId, "openai");
  } catch (error) {
    console.error("Error getting API key:", error);
  }
  if (!apiKey) {
    throw new Error("OpenAI API key not found for the active user");
  }
  const openai = new OpenAI({ apiKey });
  const llmTitleRequest = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: titleMessages(input),
    max_tokens: 20,
    temperature: 0.7,
    top_p: 0.95,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
  });

  const generatedTitle = llmTitleRequest.choices[0]?.message?.content?.trim();
  return generatedTitle;
}

async function generateTitleAzureOpenAI(input: string, userId: number) {
  const userSettings = await db.getUserSettings(userId);
  if (!userSettings.selectedAzureId) {
    throw new Error("Azure OpenAI model not found for the active user");
  }
  const azureModel = db.getAzureOpenAIModel(
    userId,
    Number(userSettings.selectedAzureId)
  );
  console.log("Azure model:", azureModel);
  if (!azureModel) {
    throw new Error("Azure OpenAI model not found for the active user");
  }
  const openai = new AzureOpenAI({
    baseURL: azureModel.endpoint,
    apiKey: azureModel.api_key,
    deployment: azureModel.model,
    apiVersion: "2024-05-01-preview",
  });

  if (!openai) {
    throw new Error("Azure OpenAI instance not initialized");
  }
  try {
    const llmTitleRequest = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: titleMessages(input),
      max_tokens: 20,
      temperature: 0.7,
    });
    const generatedTitle = llmTitleRequest.choices[0]?.message?.content?.trim();
    return generatedTitle;
  } catch (error) {
    console.error("Error generating title:", error);
    return "New Conversation";
  }
}

async function generateTitleLocalOpenAI(
  input: string,
  userId: number,
  userSettings: UserSettings
) {
  const apiKey = await getToken({ userId: userId.toString() });
  if (!apiKey) {
    throw new Error("Local OpenAI API key not found for the active user");
  }
  const openai = new OpenAI({ apiKey, baseURL: "http://127.0.0.1:47372" });
  const stream = await openai.chat.completions.create({
    model: userSettings.model || "",
    messages: titleMessages(input),
    stream: true,
    temperature: 0.7,
    max_tokens: 20,
    top_p: 0.95,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
  });
  let generatedTitle = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    generatedTitle += content;
  }
  return generatedTitle;
}

export async function generateTitle(
  input: string,
  userId: number,
  model?: string
) {
  const userSettings = await db.getUserSettings(userId);
  switch (userSettings.provider?.toLowerCase()) {
    case "openai":
      return generateTitleOpenAI(input, userId);
    case "openrouter":
      return generateTitleOpenRouter(input, userId);
    case "azure open ai":
      return generateTitleAzureOpenAI(input, userId);
    case "anthropic":
      return generateTitleAnthropic(input, userId);
    case "gemini":
      return generateTitleGemini(input, userId);
    case "xai":
      return generateTitleXAI(input, userId);
    case "local":
      return generateTitleLocalOpenAI(input, userId, userSettings);
    case "ollama":
      return generateOllamaTitle(input, model || "llama3.2");
    case "custom":
      return generateTitleCustom(
        input,
        userId,
        Number(userSettings.selectedCustomId),
        userSettings
      );
    default:
      return "New Conversation";
  }
}
