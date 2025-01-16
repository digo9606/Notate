import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      console.log("Filtered Ollama models:", filteredModels);
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
            <div className="w-full">
              <Input
                className="w-full"
                placeholder="Enter Ollama model ID (e.g. llama3.1)"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
              />
            </div>
            <div className="w-full">
              <Button variant="secondary" className="w-full" onClick={() => {}}>
                Add Model
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
