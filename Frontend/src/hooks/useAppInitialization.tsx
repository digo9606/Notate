import { useEffect, useCallback } from "react";
import { useView } from "@/context/useView";
import { useUser } from "@/context/useUser";
import { useSysSettings } from "@/context/useSysSettings";
import { initializeShiki } from "@/lib/shikiHightlight";
import { useLibrary } from "@/context/useLibrary";

export function useAppInitialization() {
  const { setActiveView } = useView();
  const {
    activeUser,
    setApiKeys,
    setConversations,
    setPrompts,
    setActiveUser,
    handleResetChat,
    setFilteredConversations,
    setIsSearchOpen,
    setSearchTerm,
    fetchDevAPIKeys,
    getUserConversations,
    fetchApiKey,
    fetchPrompts,
    setOpenRouterModels,
    setAzureModels,
    setCustomModels,
  } = useUser();
  const {
    setUserCollections,
    setSelectedCollection,
    setOpenLibrary,
    setOpenAddToCollection,
    fetchCollections,
    fetchEmbeddingModels,
  } = useLibrary();
  const {
    setSettings,
    setUsers,
    setSettingsOpen,
    checkFFMPEG,
    fetchSystemSpecs,
    setPlatform,
    setLocalModelDir,
    setLocalModels,
    setOllamaModels,
  } = useSysSettings();

  // Initial setup that doesn't depend on activeUser
  useEffect(() => {
    initializeShiki();
    fetchEmbeddingModels();
    const fetchUsers = async () => {
      if (window.electron && window.electron.getUsers) {
        try {
          const response = await window.electron.getUsers();
          const fetchedUsers = response.users as User[];
          setUsers(fetchedUsers);
          if (fetchedUsers.length === 0) {
            setActiveView("Signup");
          } else {
            setActiveView("SelectAccount");
          }
        } catch (error) {
          console.error("Error fetching users:", error);
          setActiveView("Signup");
        }
      } else {
        console.error("window.electron or getUsers method is not defined");
        setActiveView("Signup");
      }
    };
    const getPlatform = async () => {
      const plat = await window.electron.getPlatform();
      setPlatform(plat.platform);
    };
    getPlatform();
    checkFFMPEG();
    fetchUsers();
    fetchSystemSpecs();
  }, []);

  // User-dependent initialization
  useEffect(() => {
    const fetchOpenRouterModels = async () => {
      if (activeUser) {
        const models = await window.electron.getOpenRouterModels(activeUser.id);
        setOpenRouterModels(models.models);
      }
    };

    const fetchAzureModels = async () => {
      if (activeUser) {
        const models = await window.electron.getAzureOpenAIModels(
          activeUser.id
        );
        setAzureModels(
          models.models.map((m) => ({
            ...m,
            id: m.id,
            deployment: m.model,
            apiKey: m.api_key,
          }))
        );
      }
    };

    const fetchCustomModels = async () => {
      if (activeUser) {
        const models = await window.electron.getCustomAPIs(activeUser.id);
        setCustomModels(models.api);
      }
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
    const fetchSettings = async () => {
      if (activeUser) {
        const settings = await window.electron.getUserSettings(activeUser.id);
        if (parseInt(settings?.ollamaIntegration?.toString() ?? "0") === 1) {
          handleOllamaIntegration();
        }
        setSettings(settings);
        if (settings.modelDirectory) {
          setLocalModelDir(settings.modelDirectory);
          const models = (await window.electron.getDirModels(
            settings.modelDirectory
          )) as unknown as { dirPath: string; models: Model[] };
          setLocalModels(models.models);
          if (
            settings.provider === "local" &&
            settings.model &&
            settings.modelType
          ) {
            await window.electron.loadModel({
              model_location: settings.modelLocation as string,
              model_name: settings.model,
              model_type: settings.modelType as string,
              user_id: activeUser.id,
            });
          }
        }
      }
    };

    if (activeUser) {
      fetchOpenRouterModels();
      fetchSettings();
      getUserConversations();
      fetchApiKey();
      fetchPrompts();
      fetchDevAPIKeys();
      fetchCollections();
      fetchAzureModels();
      fetchCustomModels();
    }
  }, [activeUser]);

  const handleResetUserState = useCallback(() => {
    setActiveUser(null);
    setUserCollections([]);
    setApiKeys([]);
    setConversations([]);
    setPrompts([]);
    setSettings({});
    setSelectedCollection(null);
    setFilteredConversations([]);
    setOpenLibrary(false);
    setOpenAddToCollection(false);
    setIsSearchOpen(false);
    setSearchTerm("");
    setSettingsOpen(false);
    handleResetChat();
  }, [
    setActiveUser,
    setUserCollections,
    setApiKeys,
    setConversations,
    setPrompts,
    setSettings,
    setSelectedCollection,
    setFilteredConversations,
    setOpenLibrary,
    setOpenAddToCollection,
    setIsSearchOpen,
    setSearchTerm,
    setSettingsOpen,
    handleResetChat,
  ]);

  const handleViewChange = useCallback(
    (view: View) => {
      setActiveView(view);
    },
    [setActiveView]
  );

  useEffect(() => {
    const unsubscribeReset =
      window.electron.subscribeResetUserState(handleResetUserState);
    const unsubscribeView =
      window.electron.subscribeChangeView(handleViewChange);

    return () => {
      unsubscribeReset();
      unsubscribeView();
    };
  }, [handleResetUserState, handleViewChange]);
}
