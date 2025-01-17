import {
  Ollama,
  OpenAI,
  OpenRouter,
  XAI,
  Anthropic,
  Gemini,
  Azure,
} from "@lobehub/icons";
import { HouseIcon } from "lucide-react";

export const providerIcons = {
  OpenAI: <OpenAI className="h-3 w-3" />,
  Anthropic: <Anthropic className="h-3 w-3" />,
  Gemini: <Gemini className="h-3 w-3" />,
  XAI: <XAI className="h-3 w-3" />,
  Local: <HouseIcon className="h-3 w-3" />,
  Openrouter: <OpenRouter className="h-3 w-3" />,
  Ollama: <Ollama className="h-3 w-3" />,
  "Azure Open AI": <Azure className="h-3 w-3" />,
};
