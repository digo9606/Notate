import openai from "@/assets/providers/openai.svg";
import anthropic from "@/assets/providers/anthropic.svg";
import gemini from "@/assets/providers/gemini.svg";
import xai from "@/assets/providers/xai.svg";
import openrouter from "@/assets/providers/openrouter.svg";
import ollama from "@/assets/providers/ollama.svg";
import azure from "@/assets/providers/azure.svg";
import { HouseIcon } from "lucide-react";
import { ReactNode } from "react";

const SvgIcon = ({ src, alt }: { src: string; alt: string }) => (
  <div className="h-3 w-3 relative">
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-contain [filter:brightness(0)_invert(1)]"
    />
  </div>
);

export const providerIcons: Record<string, ReactNode> = {
  OpenAI: <SvgIcon src={openai} alt="OpenAI" />,
  Anthropic: <SvgIcon src={anthropic} alt="Anthropic" />,
  Gemini: <SvgIcon src={gemini} alt="Gemini" />,
  XAI: <SvgIcon src={xai} alt="XAI" />,
  Local: <HouseIcon className="h-3 w-3" />,
  OpenRouter: <SvgIcon src={openrouter} alt="OpenRouter" />,
  Ollama: <SvgIcon src={ollama} alt="Ollama" />,
  "Azure Open AI": <SvgIcon src={azure} alt="Azure" />,
};
