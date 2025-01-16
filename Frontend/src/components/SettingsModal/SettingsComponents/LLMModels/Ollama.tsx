import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { useSysSettings } from "@/context/useSysSettings";
import { useUser } from "@/context/useUser";
import { useState } from "react";

export default function Ollama() {
  const { settings, setSettings, ollamaModels, setOllamaModels } =
    useSysSettings();
  const { activeUser } = useUser();
  const [ollamaModel, setOllamaModel] = useState<string>("");

  const handleOllamaIntegration = async () => {
    const startUpOllama = await window.electron.checkOllama();
    if (activeUser && startUpOllama) {
      const models = await window.electron.fetchOllamaModels();
      const filteredModels = (models.models as unknown as string[])
        .filter((model) => !model.includes("granite"))
        .map((model) => ({ name: model, type: "ollama" }));
      await window.electron.updateUserSettings(
        activeUser.id,
        "ollamaIntegration",
        "true"
      );
      setOllamaModels(filteredModels);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button
          variant={
            settings.ollamaIntegration === "true" ? "default" : "outline"
          }
          className="w-full"
          onClick={async () => {
            const newValue =
              settings.ollamaIntegration === "true" ? "false" : "true";
            if (activeUser) {
              setSettings({
                ...settings,
                ollamaIntegration: newValue,
              });

              await window.electron.updateUserSettings(
                activeUser.id,
                "ollamaIntegration",
                newValue
              );

              if (newValue === "true") {
                await handleOllamaIntegration();
              } else {
                setOllamaModels([]);
              }
            }
          }}
        >
          {settings.ollamaIntegration === "true"
            ? "Ollama Integration Enabled"
            : "Integrate with Ollama"}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {ollamaModels.length > 0 && (
          <>
            <div className="text-xs text-muted-foreground">
              <div className="w-full flex flex-col gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex flex-row gap-2 items-center">
                      <HelpCircle className="w-4 h-4" />
                      <Input
                        className="w-full"
                        placeholder="Enter model ID (e.g. TheBloke/Mistral-7B-v0.1-GGUF)"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      Enter a Ollama model ID (e.g.
                      TheBloke/Mistral-7B-v0.1-GGUF).
                      <br />
                      Hugging Face models can be used by prefixing the model ID{" "}
                      <br />
                      with "hf.co/" (e.g. hf.co/TheBloke/Mistral-7B-v0.1-GGUF).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="w-full flex flex-row gap-2 pt-2">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {}}
                >
                  Download Model
                </Button>
              </div>
              <div className="w-full flex flex-row gap-2 justify-end pt-1">
                <a
                  href="https://ollama.ai/models"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Browse models on Ollama →
                </a>
              </div>
              <div className="w-full flex flex-row gap-2 justify-end pt-1">
                <a
                  href="https://huggingface.co/models?pipeline_tag=text-generation&sort=trending"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Browse models on Hugging Face →
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
