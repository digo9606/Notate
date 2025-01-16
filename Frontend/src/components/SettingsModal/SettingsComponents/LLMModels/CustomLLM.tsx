import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useUser } from "@/context/useUser";

export default function CustomLLM() {
  const { apiKeys, apiKeyInput, setApiKeyInput } = useUser();
  const [customProvider, setCustomProvider] = useState("");
  const [showUpdateInput, setShowUpdateInput] = useState(false);
  const hasActiveKey = apiKeys.some((key) => key.provider === "custom");
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
}
