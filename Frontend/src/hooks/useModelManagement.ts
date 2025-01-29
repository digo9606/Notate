import { useCallback, useState } from "react";

export const useModelManagement = (activeUser: User | null) => {
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [azureModels, setAzureModels] = useState<AzureModel[]>([]);
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);

  const fetchOpenRouterModels = useCallback(async () => {
    if (!window.electron || !activeUser) return;
    const models = await window.electron.getOpenRouterModels(activeUser.id);
    setOpenRouterModels(models.models);
  }, [activeUser]);

  const fetchAzureModels = useCallback(async () => {
    if (!window.electron || !activeUser) return;
    const models = await window.electron.getAzureOpenAIModels(activeUser.id);
    setAzureModels(
      models.models.map((m) => ({
        ...m,
        id: m.id,
        deployment: m.model,
        apiKey: m.api_key,
      }))
    );
  }, [activeUser]);

  const fetchCustomModels = useCallback(async () => {
    if (!window.electron || !activeUser) return;
    const models = await window.electron.getCustomAPIs(activeUser.id);
    setCustomModels(models.api);
  }, [activeUser]);

  return {
    openRouterModels,
    setOpenRouterModels,
    azureModels,
    setAzureModels,
    customModels,
    setCustomModels,
    fetchOpenRouterModels,
    fetchAzureModels,
    fetchCustomModels,
  };
};
