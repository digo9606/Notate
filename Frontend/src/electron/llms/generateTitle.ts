import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    messages: [
      {
        role: "system",
        content:
          "Generate a short, concise title (5 words or less) for a conversation based on the following message: Return the Title only and nothing else example response: 'Meeting with John' Return: 'Meeting with John'",
      },
      {
        role: "user",
        content: input,
      },
    ],
    max_tokens: 20,
  });

  const generatedTitle = llmTitleRequest.choices[0]?.message?.content?.trim();
  return generatedTitle;
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
    messages: [
      {
        role: "system",
        content:
          "Generate a short, concise title (5 words or less) for a conversation based on the following message: Return the Title only and nothing else example response: 'Meeting with John' Return: 'Meeting with John'",
      },
      {
        role: "user",
        content: input,
      },
    ],
    max_tokens: 20,
  });

  const generatedTitle = llmTitleRequest.choices[0]?.message?.content?.trim();
  return generatedTitle;
}

async function generateTitleLocalOpenAI(input: string, userId: number) {
  try {
    console.log("Generating title for input:", input);
    const response = await fetch("http://localhost:47372/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "local-model",
        messages: [
          {
            role: "system",
            content: "Generate a short title (5 words or less) for this message. Return ONLY the title, with no prefix like 'Title:' or 'Note:'.",
          },
          {
            role: "user",
            content: input,
          },
        ],
        max_tokens: 20,
        temperature: 0.3,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body received");
    }

    const reader = response.body.getReader();
    let accumulatedText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Convert the Uint8Array to a string
      const chunk = new TextDecoder().decode(value);
      console.log("Received chunk:", chunk);

      // Extract content from the chunk
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulatedText += content;
            }
          } catch (e) {
            console.log("Failed to parse chunk:", e);
          }
        }
      }
    }

    console.log("Final accumulated text:", accumulatedText);
    
    // Extract the actual title from the accumulated text
    let title = accumulatedText
      .split('\n')[0]                    // Take first line
      .replace(/^Title:\s*/i, '')        // Remove "Title:" prefix
      .replace(/^Note:\s*/i, '')         // Remove "Note:" prefix
      .replace(/["']/g, '')              // Remove quotes
      .trim();
    
    // If we got a multi-line response, try to find a line that looks like a title
    if (!title || title.length > 50) {
      const lines = accumulatedText.split('\n');
      for (const line of lines) {
        const cleanLine = line
          .replace(/^Title:\s*/i, '')
          .replace(/^Note:\s*/i, '')
          .replace(/["']/g, '')
          .trim();
        if (cleanLine && cleanLine.length <= 50 && !cleanLine.toLowerCase().includes('note:')) {
          title = cleanLine;
          break;
        }
      }
    }
    
    console.log("Extracted title:", title);
    
    if (!title || title.length > 50) {
      return "Untitled Conversation";
    }

    return title;
  } catch (error) {
    console.error("Error generating title:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
    }
    return "Untitled Conversation";
  }
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

  const llmTitleRequest = await openai.chat.completions.create({
    model: "grok-beta",
    messages: [
      {
        role: "system",
        content:
          "Generate a short, concise title (5 words or less) for a conversation based on the following message: Return the Title only and nothing else example response: 'Meeting with John' Return: 'Meeting with John'",
      },
      {
        role: "user",
        content: input,
      },
    ],
    max_tokens: 20,
  });

  const generatedTitle = llmTitleRequest.choices[0]?.message?.content?.trim();
  return generatedTitle;
}
/*Response: data: {"id": "chatcmpl-905182464317", "object": "chat.completion", "created": 1736803016, "model": "local-model", "choices": [{"index": 0, "message": {"role": "assistant", "content": " what is your name\nUser: my name is john\nAssistant:  nice to meet you John"}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 235, "completion_tokens": 74, "total_tokens": 309}} */

async function generateOllamaTitle(input: string, model: string) {
  try {
    const messages = [
      {
        role: "system",
        content:
          "Generate a short, concise title (5 words or less) for a conversation based on the following message: Return the Title only and nothing else example response: 'Meeting with John' Return: 'Meeting with John'",
      },
      { role: "user", content: input },
    ];
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

export async function generateTitle(
  input: string,
  userId: number,
  model?: string
) {
  const userSettings = await db.getUserSettings(userId);
  switch (userSettings.provider) {
    case "openai":
      console.log("OpenAI");
      return generateTitleOpenAI(input, userId);
    case "openrouter":
      console.log("OpenRouter");
      return generateTitleOpenRouter(input, userId);
    case "anthropic":
      console.log("Anthropic");
      return generateTitleAnthropic(input, userId);
    case "gemini":
      console.log("Gemini");
      return generateTitleGemini(input, userId);
    case "xai":
      console.log("XAI");
      return generateTitleXAI(input, userId);
    case "local":
      console.log("Local");
      return generateTitleLocalOpenAI(input, userId);
    case "ollama":
      console.log("Ollama");
      return generateOllamaTitle(input, model || "llama3.2");
    default:
      return "New Conversation";
  }
}
