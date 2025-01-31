import { useCallback, useState } from "react";

export const useModelManagement = (activeUser: User | null) => {
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>(
    []
  );
  const [azureModels, setAzureModels] = useState<AzureModel[]>([]);
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [userTools, setUserTools] = useState<UserTool[]>([]);
  const [systemTools, setSystemTools] = useState<Tool[]>([]);
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

  const fetchTools = useCallback(async () => {
    if (!window.electron || !activeUser) return;
    const tools = await window.electron.getUserTools(activeUser.id);
    const toolsWithEnabled = tools.tools.map((tool) => ({
      ...tool,
      enabled: tool.enabled,
    }));
    console.log(toolsWithEnabled);
  }, [activeUser]);

  const fetchSystemTools = useCallback(async () => {
    if (!window.electron || !activeUser) return;
    const tools = await window.electron.getTools();
    setSystemTools(tools.tools);
    console.log(tools.tools);
  }, [activeUser]);

  const toggleTool = (tool: UserTool) => {
    if (!activeUser) return;
    const existingTool = userTools.find((t) => t.id === tool.id);

    if (existingTool) {
      setUserTools((prev) =>
        prev.map((t) =>
          t.id === tool.id ? { ...t, enabled: t.enabled === 1 ? 0 : 1 } : t
        )
      );
      window.electron.updateUserTool(
        activeUser.id,
        tool.id,
        existingTool.enabled === 1 ? 0 : 1,
        tool.docked
      );
    } else {
      setUserTools((prev) => [
        ...prev,
        {
          ...tool,
          enabled: 1,
          docked: tool.docked,
        },
      ]);
      window.electron.updateUserTool(activeUser.id, tool.id, 1, tool.docked);
    }
  };

  const dockTool = (tool: UserTool) => {
    if (
      userTools.some((t) => t.name.toLowerCase() === tool.name.toLowerCase())
    ) {
      if (!activeUser) return;
      setUserTools((prev) => prev.filter((t) => t.name !== tool.name));
      window.electron.updateUserTool(activeUser.id, tool.id, 0, 0);
    } else {
      setUserTools((prev) => [
        ...prev,
        {
          ...tool,
          enabled: 1,
          docked: 1,
        },
      ]);
      if (!activeUser) return;
      window.electron.updateUserTool(activeUser.id, tool.id, 1, 1);
    }
  };

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
    tools,
    setTools,
    dockTool,
    fetchTools,
    systemTools,
    setSystemTools,
    fetchSystemTools,
    userTools,
    setUserTools,
    toggleTool,
  };
};
