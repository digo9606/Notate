import { Button } from "@/components/ui/button";
import AddOllamaModel from "./AddOllamaModel";
import { useSysSettings } from "@/context/useSysSettings";
import { useUser } from "@/context/useUser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function Ollama() {
  const {
    settings,
    setSettings,
    ollamaModels,
    setOllamaModels,
    handleRunOllama,
    localModalLoading,
  } = useSysSettings();
  const { activeUser } = useUser();
  const [selectedModel, setSelectedModel] = useState("");
  const formatModelName = (name: string) => {
    const parts = name.split("-");
    if (parts.length <= 2) return name;
    return `${parts[0]}-${parts[1]}...`;
  };

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
        1
      );
      setOllamaModels(filteredModels);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button
          variant={settings.ollamaIntegration === 1 ? "default" : "outline"}
          className="w-full"
          onClick={async () => {
            const newValue = settings.ollamaIntegration === 1 ? 0 : 1;
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

              if (newValue === 1) {
                await handleOllamaIntegration();
              } else {
                setOllamaModels([]);
              }
            }
          }}
        >
          {settings.ollamaIntegration === 1
            ? "Ollama Integration Enabled"
            : "Integrate with Ollama"}
        </Button>
      </div>
      {settings.ollamaIntegration === 1 && (
        <div className="flex flex-row gap-2">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a local model" />
            </SelectTrigger>
            <SelectContent>
              {Array.isArray(ollamaModels) &&
                ollamaModels.map((model) => (
                  <SelectItem key={model.name} value={model.name}>
                    {formatModelName(model.name)} ({model.type})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            disabled={!selectedModel || localModalLoading}
            className=""
            onClick={() => {
              if (activeUser) {
                handleRunOllama(selectedModel, activeUser);
              }
            }}
          >
            {localModalLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              "Run"
            )}
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {ollamaModels.length > 0 && <AddOllamaModel />}
      </div>
    </div>
  );
}
