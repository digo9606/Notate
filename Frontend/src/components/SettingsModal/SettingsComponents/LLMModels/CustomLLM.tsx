import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useUser } from "@/context/useUser";
import { toast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export default function CustomLLM() {
  const { apiKeyInput, setApiKeyInput, activeUser } = useUser();
  const [customProvider, setCustomProvider] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!activeUser) return;
      await window.electron.updateUserSettings(
        activeUser.id,
        "provider",
        customProvider
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
      await window.electron.addAPIKey(
        activeUser.id,
        apiKeyInput,
        customProvider
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
        id="custom-provider-name"
        type="text"
        placeholder="Enter custom provider name (e.g. Deployed ooba model)"
        value={customProvider}
        onChange={(e) => setCustomProvider(e.target.value)}
        className="input-field"
      />
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a endpoint type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="openai">OpenAI</SelectItem>
          <SelectItem value="openai">ooba</SelectItem>
          <SelectItem value="openai">ollama</SelectItem>
          <SelectItem value="openai">anthropic</SelectItem>
          <SelectItem value="openai">gemini</SelectItem>
        </SelectContent>
      </Select>
      <Input
        id="custom-base-url"
        type="text"
        placeholder="Enter custom base url (e.g. https://api.custom.com/v1)"
        value={customBaseUrl}
        onChange={(e) => setCustomBaseUrl(e.target.value)}
        className="input-field"
      />
      <Input
        id="custom-model"
        type="text"
        placeholder="Enter custom model (e.g. gpt-4o)"
        value={customModel}
        onChange={(e) => setCustomModel(e.target.value)}
        className="input-field"
      />
      <Input
        id="custom-api-key"
        type="password"
        placeholder="Enter your custom API key"
        className="input-field"
        value={apiKeyInput}
        onChange={(e) => setApiKeyInput(e.target.value)}
      />
      <Button variant="secondary" onClick={handleSubmit} className="w-full">
        Add Custom Provider
      </Button>
    </div>
  );
}
