import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useUser } from "@/context/useUser";
import { defaultProviderModel } from "./defaultsProviderModels";
import { useSysSettings } from "@/context/useSysSettings";
import { toast } from "@/hooks/use-toast";
import { providerIcons } from "./providerIcons";
import { Plus, X } from "lucide-react";

export default function ExternalApi() {
  const {
    apiKeys,
    activeUser,
    handleResetChat,
    setApiKeys,
    setOpenRouterModels,
  } = useUser();
  const { setSettings } = useSysSettings();
  const [selectedProvider, setSelectedProvider] = useState<Provider>("openai");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [openRouterModel, setOpenRouterModel] = useState<string>("");
  const [showOpenRouterInput, setShowOpenRouterInput] =
    useState<boolean>(false);
  const handleProviderModelChange = async (provider: Provider) => {
    setSettings((prev) => ({
      ...prev,
      provider: provider,
      model: defaultProviderModel[provider],
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
            defaultProviderModel[provider]
          );
        }
      }
    } catch (error) {
      console.error("Error updating user settings:", error);
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
    if (activeUser) {
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
    }
    setApiKeyInput("");
    toast({
      title: "API Key Saved",
      description: `Your ${selectedProvider.toUpperCase()} API key has been saved successfully.`,
    });
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
        setShowOpenRouterInput(false);
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="provider" className="text-right text-sm font-medium">
          LLM Provider
        </Label>
        <div className="col-span-3">
          <Select
            value={selectedProvider}
            onValueChange={(value: Provider) => setSelectedProvider(value)}
          >
            <SelectTrigger id="provider" className="w-full">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="gemini">Google (Gemini)</SelectItem>
              <SelectItem value="xai">XAI</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="apiKey" className="text-right text-sm font-medium">
          API Key
        </Label>
        <div className="col-span-3">
          <Input
            id="apiKey"
            disabled={
              selectedProvider !== "openai" &&
              selectedProvider !== "anthropic" &&
              selectedProvider !== "gemini" &&
              selectedProvider !== "xai" &&
              selectedProvider !== "openrouter"
            }
            type="password"
            placeholder="Enter your API key"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
        </div>
      </div>
      {!showOpenRouterInput ? (
        <Button
          variant="outline"
          type="button"
          onClick={() => setShowOpenRouterInput(true)}
          className="w-full flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add OpenRouter Model
        </Button>
      ) : (
        <div className="space-y-4 mt-4 p-4 border rounded-lg">
          <div className="flex justify-between items-center">
            <Label className="text-sm font-medium">Add OpenRouter Model</Label>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setShowOpenRouterInput(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter OpenRouter model ID (e.g. openai/gpt-3.5-turbo)"
              value={openRouterModel}
              onChange={(e) => setOpenRouterModel(e.target.value)}
            />
            <Button
              type="button"
              onClick={handleAddOpenRouterModel}
              variant="secondary"
            >
              Add Model
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          onClick={() => handleProviderModelChange(selectedProvider)}
        >
          Save API Key
        </Button>
      </div>

      {apiKeys.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {apiKeys.map((apiKey) => (
            <div
              key={apiKey.id}
              className="inline-flex items-center px-2.5 py-1 rounded-[4px] text-xs font-medium bg-secondary border shadow-sm"
            >
              {providerIcons[apiKey.provider as keyof typeof providerIcons]}
              <span className="ml-1.5">
                {apiKey.provider.charAt(0).toUpperCase() +
                  apiKey.provider.slice(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
