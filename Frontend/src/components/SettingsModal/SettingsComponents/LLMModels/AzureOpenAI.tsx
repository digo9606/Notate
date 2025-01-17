import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useUser } from "@/context/useUser";
import { toast } from "@/hooks/use-toast";
export default function CustomLLM() {
  const { apiKeyInput, setApiKeyInput, activeUser } = useUser();
  const [customProvider, setCustomProvider] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!activeUser) return;
      const azureId = await window.electron.addAzureOpenAIModel(
        activeUser.id,
        customProvider,
        customModel,
        customBaseUrl,
        apiKeyInput
      );
      await window.electron.updateUserSettings(
        activeUser.id,
        "provider",
        "Azure Open AI"
      );
      await window.electron.updateUserSettings(
        activeUser.id,
        "selectedAzureId",
        azureId.toString()
      );
      await window.electron.updateUserSettings(
        activeUser.id,
        "base_url",
        customBaseUrl
      );
      await window.electron.updateUserSettings(
        activeUser.id,
        "model",
        customModel
      );

      toast({
        title: "Custom provider added",
        description: "Your custom provider has been added",
      });
      setCustomProvider("");
      setCustomBaseUrl("");
      setApiKeyInput("");
      setCustomModel("");
    } catch (error) {
      toast({
        title: "Error",
        description:
          "An error occurred while adding your custom provider. Please try again." +
          error,
      });
    }
  };

  return (
    <div className="space-y-2">
      <Input
        id="name"
        type="text"
        placeholder="Enter a names (e.g. Azure OpenAI gpt-4o)"
        value={customProvider}
        onChange={(e) => setCustomProvider(e.target.value)}
        className="input-field"
      />
      <Input
        id="azure-endpoint"
        type="text"
        placeholder="Enter Azure endpoint (e.g. https://customname.openai.azure.com)"
        value={customBaseUrl}
        onChange={(e) => setCustomBaseUrl(e.target.value)}
        className="input-field"
      />
      <Input
        id="custom-model"
        type="text"
        placeholder="Enter model (e.g. gpt-4o)"
        value={customModel}
        onChange={(e) => setCustomModel(e.target.value)}
        className="input-field"
      />
      <Input
        id="azure-api-key"
        type="password"
        placeholder="Enter your Azure API key"
        className="input-field"
        value={apiKeyInput}
        onChange={(e) => setApiKeyInput(e.target.value)}
      />

      <Button variant="secondary" onClick={handleSubmit} className="w-full">
        Add Azure Open AI Provider
      </Button>
    </div>
  );
}
