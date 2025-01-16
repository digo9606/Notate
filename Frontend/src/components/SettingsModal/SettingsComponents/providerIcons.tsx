import {
  Ollama,
  OpenAI,
  OpenRouter,
  XAI,
  Anthropic,
  Gemini,
} from "@lobehub/icons";
import { HouseIcon } from "lucide-react";

export const providerIcons = {
  openai: <OpenAI className="h-3 w-3" />,
  anthropic: <Anthropic className="h-3 w-3" />,
  gemini: <Gemini className="h-3 w-3" />,
  xai: <XAI className="h-3 w-3" />,
  local: <HouseIcon className="h-3 w-3" />,
  openrouter: <OpenRouter className="h-3 w-3" />,
  ollama: <Ollama className="h-3 w-3" />,
};
