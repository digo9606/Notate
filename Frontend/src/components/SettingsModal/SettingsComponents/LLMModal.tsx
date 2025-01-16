"use client";

import { useState } from "react";
import { FolderOpenIcon, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useSysSettings } from "@/context/useSysSettings";
import { useUser } from "@/context/useUser";
import { providerIcons } from "./providerIcons";
import { defaultProviderModel } from "./defaultsProviderModels";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const formatDirectoryPath = (path: string | null) => {
  if (!path) return "Not set";
  const parts = path.split("/");
  const lastTwoParts = parts.slice(-2);
  return `.../${lastTwoParts.join("/")}`;
};

export default function LLMPanel() {
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(
    null
  );
  const [showUpdateInput, setShowUpdateInput] = useState(false);
  const {
    activeUser,
    setOpenRouterModels,
    openRouterModels,
    apiKeys,
    setApiKeys,
    handleResetChat,
  } = useUser();
  const {
    setSettings,
    settings,
    setOllamaModels,
    ollamaModels,
    localModels,
    localModelDir,
    setLocalModelDir,
    setLocalModels,
  } = useSysSettings();
  const [customProvider, setCustomProvider] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState<string>("");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [hasOpenRouter, setHasOpenRouter] = useState<boolean>(
    openRouterModels.length > 0
  );
  const [localModel, setLocalModel] = useState<string>("");
  const [ollamaModel, setOllamaModel] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

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
  const formatModelName = (name: string) => {
    const parts = name.split("-");
    if (parts.length <= 2) return name;
    return `${parts[0]}-${parts[1]}...`;
  };

  const handleAddOpenRouterModel = async () => {
    if (!openRouterModel.trim()) {
      toast({
        title: "Model Required",
        description: "Please enter an OpenRouter model ID.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (activeUser) {
        setSettings((prev) => ({
          ...prev,
          model: openRouterModel.trim(),
          provider: "openrouter",
        }));
        await window.electron.addOpenRouterModel(
          activeUser.id,
          openRouterModel.trim()
        );
        setOpenRouterModels((prevModels) => [
          ...prevModels,
          openRouterModel.trim(),
        ]);
        await window.electron.updateUserSettings(
          activeUser.id,
          "model",
          openRouterModel.trim()
        );
        await window.electron.updateUserSettings(
          activeUser.id,
          "provider",
          "openrouter"
        );
        toast({
          title: "Model Added",
          description: `OpenRouter model ${openRouterModel} has been added successfully.`,
        });
        setOpenRouterModel("");
      }
    } catch (error) {
      console.error("Error adding OpenRouter model:", error);
      toast({
        title: "Error",
        description: "Failed to add OpenRouter model. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedApiKey = apiKeyInput.trim();
    const result = await window.electron.keyValidation({
      apiKey: trimmedApiKey,
      inputProvider: selectedProvider,
    });
    if (result.error) {
      toast({
        title: "Invalid API Key",
        description: "API key is invalid. Please try again.",
        variant: "destructive",
      });
      return;
    }

    handleResetChat();
    if (activeUser && selectedProvider) {
      await window.electron.addAPIKey(
        activeUser.id,
        trimmedApiKey,
        selectedProvider
      );
      if (!apiKeys.some((key) => key.provider === selectedProvider)) {
        setApiKeys((prevKeys) => [
          ...prevKeys,
          { id: Date.now(), key: trimmedApiKey, provider: selectedProvider },
        ]);
      }
      setShowUpdateInput(false);
      setApiKeyInput("");
      toast({
        title: "API Key Saved",
        description: `Your ${selectedProvider.toUpperCase()} API key has been saved successfully.`,
      });
    }
  };

  const handleSelectDirectory = async () => {
    try {
      if (!activeUser) return;
      const dirPath = await window.electron.openDirectory();
      if (dirPath) {
        setLocalModelDir(dirPath);
        window.electron.updateUserSettings(activeUser.id, "model_dir", dirPath);
        const response = (await window.electron.getDirModels(
          dirPath
        )) as unknown as { dirPath: string; models: Model[] };
        setLocalModels(response.models);
        toast({
          title: "Directory selected",
          description: `Selected directory: ${dirPath}`,
        });
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
      toast({
        title: "Error",
        description: "Failed to select directory",
        variant: "destructive",
      });
    }
  };

  const renderInputs = () => {
    const hasActiveKey = apiKeys.some(
      (key) => key.provider === selectedProvider
    );

    switch (selectedProvider) {
      case "anthropic":
      case "xai":
      case "gemini":
      case "openai":
        return (
          <div className="space-y-4">
            {!hasActiveKey || showUpdateInput ? (
              <Input
                id={`${selectedProvider}-api-key`}
                type="password"
                placeholder={`Enter your ${selectedProvider.toUpperCase()} API key`}
                className="input-field"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
            ) : (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setShowUpdateInput(true);
                  setApiKeyInput("");
                }}
              >
                Update API Key
              </Button>
            )}
          </div>
        );
      case "local":
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <p className="truncate flex-1">
                      {formatDirectoryPath(localModelDir)}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="start"
                    className="max-w-[300px] break-all"
                  >
                    <p>{localModelDir || "No directory selected"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                onClick={handleSelectDirectory}
                variant="outline"
                className="ml-2"
              >
                <FolderOpenIcon className="w-4 h-4 mr-2" />
                Select Directory
              </Button>
            </div>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a local model" />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(localModels) &&
                  localModels.map((model) => (
                    <SelectItem
                      key={model.digest || model.name}
                      value={model.name}
                    >
                      {formatModelName(model.name)} ({model.type})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex flex-col gap-2">
              <Input
                className="w-full"
                placeholder="Enter model ID (e.g. llama3.1)"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
              />
            </div>
            <Button variant="secondary" className="w-full" onClick={() => {}}>
              Add Model
            </Button>
          </div>
        );
      case "ollama":
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
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => {}}
                    >
                      Add Model
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      case "openrouter":
        return (
          <div className="space-y-2">
            {!hasOpenRouter && (
              <>
                <Input
                  id="local-model-path"
                  type="text"
                  placeholder="Enter your OpenRouter API key"
                  className="input-field"
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {}}
                >
                  Save API Key
                </Button>
              </>
            )}
            {hasOpenRouter && (
              <>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setHasOpenRouter(false)}
                >
                  Update API Key
                </Button>
                <Input
                  className="w-full"
                  placeholder="Enter OpenRouter model ID (e.g. openai/gpt-3.5-turbo)"
                  value={openRouterModel}
                  onChange={(e) => setOpenRouterModel(e.target.value)}
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => handleAddOpenRouterModel()}
                >
                  Add Model
                </Button>
              </>
            )}
          </div>
        );
      case "custom":
        return (
          <div className="space-y-2">
            <Label htmlFor="custom-provider-name">Custom Provider Name</Label>
            <Input
              id="custom-provider-name"
              type="text"
              placeholder="Enter custom provider name"
              value={customProvider}
              onChange={(e) => setCustomProvider(e.target.value)}
              className="input-field"
            />
            {!hasActiveKey || showUpdateInput ? (
              <>
                <Label htmlFor="custom-api-key">Custom API Key</Label>
                <Input
                  id="custom-api-key"
                  type="password"
                  placeholder="Enter your custom API key"
                  className="input-field"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
              </>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowUpdateInput(true);
                  setApiKeyInput("");
                }}
              >
                Update API Key
              </Button>
            )}
          </div>
        );
      default:
        return null;
    }
  };
  const handleProviderModelChange = async (provider: LLMProvider) => {
    setSettings((prev) => ({
      ...prev,
      provider: provider,
      model:
        defaultProviderModel[provider as keyof typeof defaultProviderModel],
    }));
    try {
      if (activeUser) {
        await window.electron.updateUserSettings(
          activeUser.id,
          "provider",
          provider
        );

        if (provider === "openrouter") {
          await window.electron.addOpenRouterModel(
            activeUser.id,
            "openai/gpt-3.5-turbo"
          );
        } else {
          await window.electron.updateUserSettings(
            activeUser.id,
            "model",
            defaultProviderModel[provider as keyof typeof defaultProviderModel]
          );
        }
      }
    } catch (error) {
      console.error("Error updating user settings:", error);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {Object.keys(providerIcons).map((provider) => (
          <Button
            key={provider}
            onClick={() => {
              setSelectedProvider(provider as LLMProvider);
              setApiKeyInput("");
              setShowUpdateInput(false);
            }}
            variant={selectedProvider === provider ? "default" : "outline"}
            className={`btn-provider ${
              selectedProvider === provider ? "selected" : ""
            }`}
          >
            {provider}
          </Button>
        ))}
        <Button
          onClick={() => {
            setSelectedProvider("custom");
            setApiKeyInput("");
          }}
          disabled
          variant={selectedProvider === "custom" ? "default" : "outline"}
          className={`btn-provider ${
            selectedProvider === "custom" ? "selected" : ""
          }`}
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Custom
        </Button>
      </div>
      {selectedProvider && (
        <>
          <div className="mt-6">
            {renderInputs()}
            {selectedProvider !== "openrouter" &&
              selectedProvider !== "ollama" &&
              selectedProvider !== "local" &&
              (!apiKeys.some((key) => key.provider === selectedProvider) ||
                showUpdateInput) && (
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    className="w-full mt-2"
                    type="submit"
                    onClick={(e) => {
                      handleProviderModelChange(selectedProvider);
                      handleSubmit(e);
                    }}
                  >
                    Save API Key
                  </Button>
                </div>
              )}
          </div>
        </>
      )}
      <div className="mt-4 rounded-[6px] p-4 bg-gradient-to-br from-secondary/50 via-secondary/30 to-background border">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <h3 className="text-sm font-medium">Active Providers</h3>
        </div>
        {apiKeys.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-background/80 backdrop-blur-sm border shadow-sm hover:shadow-md transition-shadow"
              >
                {providerIcons[apiKey.provider as keyof typeof providerIcons]}
                <span className="ml-1.5">
                  {apiKey.provider.charAt(0).toUpperCase() +
                    apiKey.provider.slice(1)}
                </span>
              </div>
            ))}
            {ollamaModels.length > 0 && (
              <div className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-background/80 backdrop-blur-sm border shadow-sm hover:shadow-md transition-shadow">
                <span className="ml-1.5">Ollama</span>
              </div>
            )}
            {localModels.length > 0 && (
              <div className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-background/80 backdrop-blur-sm border shadow-sm hover:shadow-md transition-shadow">
                <span className="ml-1.5">Local</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
