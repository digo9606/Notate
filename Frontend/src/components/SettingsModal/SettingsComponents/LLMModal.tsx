"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useSysSettings } from "@/context/useSysSettings";
import { useUser } from "@/context/useUser";
import { providerIcons } from "./providerIcons";
import { defaultProviderModel } from "./defaultsProviderModels";
import LocalLLM from "./LLMModels/LocalLLM";
import Ollama from "./LLMModels/Ollama";
import External from "./LLMModels/External";
import Openrouter from "./LLMModels/Openrouter";
import CustomLLM from "./LLMModels/CustomLLM";

export default function LLMPanel() {
  const [showUpdateInput, setShowUpdateInput] = useState(false);
  const {
    activeUser,
    apiKeys,
    setApiKeys,
    handleResetChat,
    apiKeyInput,
    setApiKeyInput,
  } = useUser();
  const {
    setSettings,
    ollamaModels,
    localModels,
    selectedProvider,
    setSelectedProvider,
  } = useSysSettings();

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

  const renderInputs = () => {
    switch (selectedProvider) {
      case "anthropic":
      case "xai":
      case "gemini":
      case "openai":
        return (
          <External
            showUpdateInput={showUpdateInput}
            setShowUpdateInput={setShowUpdateInput}
          />
        );
      case "local":
        return <LocalLLM />;
      case "ollama":
        return <Ollama />;
      case "openrouter":
        return <Openrouter />;
      case "custom":
        return <CustomLLM />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {Object.keys(providerIcons)
          .sort()
          .map((provider) => (
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
              {providerIcons[provider as keyof typeof providerIcons]}
              {provider}
            </Button>
          ))}
        <Button
          onClick={() => {
            setSelectedProvider("custom" as LLMProvider);
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
                      handleProviderModelChange(
                        selectedProvider as LLMProvider
                      );
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
                {providerIcons.ollama}
                <span className="ml-1.5">Ollama</span>
              </div>
            )}
            {localModels.length > 0 && (
              <div className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-background/80 backdrop-blur-sm border shadow-sm hover:shadow-md transition-shadow">
                {providerIcons.local}
                <span className="ml-1.5">Local</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
