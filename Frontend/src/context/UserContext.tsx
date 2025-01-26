import React, {
  createContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { ChatInputContext, ChatInputContextType } from "./ChatInputContext";

interface UserContextType {
  title: string | null;
  setTitle: React.Dispatch<React.SetStateAction<string | null>>;
  activeUser: User | null;
  setActiveUser: React.Dispatch<React.SetStateAction<User | null>>;
  apiKeys: ApiKey[];
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKey[]>>;
  activeConversation: number | null;
  setActiveConversation: React.Dispatch<React.SetStateAction<number | null>>;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  prompts: UserPrompts[];
  setPrompts: React.Dispatch<React.SetStateAction<UserPrompts[]>>;
  streamingMessage: string;
  setStreamingMessage: React.Dispatch<React.SetStateAction<string>>;
  filteredConversations: Conversation[];
  setFilteredConversations: React.Dispatch<
    React.SetStateAction<Conversation[]>
  >;
  isSearchOpen: boolean;
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  searchRef: React.RefObject<HTMLDivElement>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  newConversation: boolean;
  setNewConversation: React.Dispatch<React.SetStateAction<boolean>>;
  handleResetChat: () => void;
  devAPIKeys: Keys[];
  setDevAPIKeys: React.Dispatch<React.SetStateAction<Keys[]>>;
  fetchDevAPIKeys: () => Promise<void>;
  getUserConversations: () => Promise<void>;
  alertForUser: boolean;
  setAlertForUser: React.Dispatch<React.SetStateAction<boolean>>;
  fetchApiKey: () => Promise<void>;
  fetchPrompts: () => Promise<void>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  currentRequestId: number | null;
  setCurrentRequestId: React.Dispatch<React.SetStateAction<number | null>>;
  fetchMessages: () => Promise<void>;
  openRouterModels: OpenRouterModel[];
  setOpenRouterModels: React.Dispatch<React.SetStateAction<OpenRouterModel[]>>;
  apiKeyInput: string;
  setApiKeyInput: React.Dispatch<React.SetStateAction<string>>;
  azureModels: AzureModel[];
  setAzureModels: React.Dispatch<React.SetStateAction<AzureModel[]>>;
  customModels: CustomModel[];
  setCustomModels: React.Dispatch<React.SetStateAction<CustomModel[]>>;
  fetchOpenRouterModels: () => Promise<void>;
  fetchAzureModels: () => Promise<void>;
  fetchCustomModels: () => Promise<void>;
  streamingMessageReasoning: string | null;
  setStreamingMessageReasoning: React.Dispatch<React.SetStateAction<string>>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const UserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>(
    []
  );
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [activeConversation, setActiveConversation] = useState<number | null>(
    null
  );
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [filteredConversations, setFilteredConversations] = useState<
    Conversation[]
  >([]);
  const [title, setTitle] = useState<string | null>(null);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [streamingMessageReasoning, setStreamingMessageReasoning] =
    useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [prompts, setPrompts] = useState<UserPrompts[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const searchRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newConversation, setNewConversation] = useState<boolean>(true);
  const [devAPIKeys, setDevAPIKeys] = useState<Keys[]>([]);
  const [alertForUser, setAlertForUser] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState<number | null>(null);
  const [azureModels, setAzureModels] = useState<AzureModel[]>([]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
        setSearchTerm("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  const fetchOpenRouterModels = useCallback(async () => {
    if (activeUser) {
      const models = await window.electron.getOpenRouterModels(activeUser.id);
      setOpenRouterModels(models.models);
    }
  }, [activeUser]);

  const fetchAzureModels = useCallback(async () => {
    if (activeUser) {
      const models = await window.electron.getAzureOpenAIModels(activeUser.id);
      setAzureModels(
        models.models.map((m) => ({
          ...m,
          id: m.id,
          deployment: m.model,
          apiKey: m.api_key,
        }))
      );
    }
  }, [activeUser]);

  const fetchCustomModels = useCallback(async () => {
    if (activeUser) {
      const models = await window.electron.getCustomAPIs(activeUser.id);
      setCustomModels(models.api);
    }
  }, [activeUser]);
  const fetchMessages = useCallback(async () => {
    if (activeConversation) {
      const conversation = conversations.find(
        (conv: Conversation) => conv.id === activeConversation
      );
      if (conversation && activeUser) {
        const newMessages =
          await window.electron.getConversationMessagesWithData(
            activeUser.id,
            conversation.id
          );
        setMessages(newMessages.messages);
      }
    }
  }, [activeConversation, conversations, activeUser]);

  const cancelRequest = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (currentRequestId) {
        window.electron.abortChatRequest(currentRequestId);
        setTimeout(() => {
          setStreamingMessage("");
          resolve();
        }, 100);
      } else {
        resolve();
      }
    });
  }, [currentRequestId]);

  const handleResetChat = useCallback(async () => {
    await cancelRequest();
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setStreamingMessage("");
    setActiveConversation(null);
  }, [cancelRequest]);

  const getUserConversations = useCallback(async () => {
    if (activeUser) {
      const conversations = await window.electron.getUserConversations(
        activeUser.id
      );
      setConversations(conversations.conversations);
    }
  }, [activeUser]);

  const fetchDevAPIKeys = useCallback(async () => {
    if (activeUser) {
      const keys = await window.electron.getDevAPIKeys(activeUser.id);
      setDevAPIKeys(keys.keys);
    }
  }, [activeUser]);

  const fetchApiKey = useCallback(async () => {
    if (activeUser) {
      const apiKeys = await window.electron.getUserApiKeys(activeUser.id);
      const settings = await window.electron.getUserSettings(activeUser.id);
      if (apiKeys.apiKeys.length === 0 && settings.provider !== "local") {
        setAlertForUser(true);
        return;
      }
      setApiKeys(apiKeys.apiKeys as ApiKey[]);
    }
  }, [activeUser]);

  const fetchPrompts = useCallback(async () => {
    if (activeUser) {
      const fetchedPrompts = await window.electron.getUserPrompts(
        activeUser.id
      );
      setPrompts(fetchedPrompts.prompts as UserPrompts[]);
    }
  }, [activeUser]);

  const handleChatRequest = useCallback(
    async (collectionId: number | undefined, suggestion?: string) => {
      setIsLoading(true);
      const requestId = Date.now();
      setCurrentRequestId(requestId);

      setError(null);
      const newUserMessage = {
        role: "user",
        content: suggestion || input,
        timestamp: new Date(),
      } as Message;
      setMessages((prev) => [...prev, newUserMessage]);
      setInput("");

      try {
        if (!activeUser) {
          throw new Error("Active user not found");
        }
        const result = (await window.electron.chatRequest(
          [...messages, newUserMessage],
          activeUser,
          Number(activeConversation),
          collectionId || undefined,
          undefined,
          requestId
        )) as {
          id: bigint | number;
          messages: Message[];
          title: string;
          error?: string;
        };
        console.log(streamingMessageReasoning);
        setTitle(result.title);
        if (result.error) {
          setError(result.error);
          setIsLoading(false);
          console.error("Error in chat:", result.error);
        } else {
          const getMessageLength = result.messages.length;
          setMessages((prev) => [
            ...prev,
            result.messages[getMessageLength - 1],
          ]);
          setActiveConversation(Number(result.id));
          if (result.id !== Number(activeConversation)) {
            const latestMessage = result.messages[getMessageLength - 1];
            const newConversation = {
              id: Number(result.id),
              title: result.title,
              userId: activeUser.id,
              created_at: new Date(),
              latestMessageTime: latestMessage?.timestamp
                ? new Date(latestMessage.timestamp).getTime()
                : Date.now(),
            };
            await fetchMessages();
            setConversations((prev) => [newConversation, ...prev]);
            setFilteredConversations((prev) => [newConversation, ...prev]);
          } else {
            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.id === Number(result.id)) {
                  const latestMessage = result.messages[getMessageLength - 1];
                  return {
                    ...conv,
                    latestMessageTime: latestMessage?.timestamp
                      ? new Date(latestMessage.timestamp).getTime()
                      : Date.now(),
                  };
                }
                return conv;
              })
            );
            setFilteredConversations((prev) =>
              prev.map((conv) => {
                if (conv.id === Number(result.id)) {
                  const latestMessage = result.messages[getMessageLength - 1];
                  return {
                    ...conv,
                    latestMessageTime: latestMessage?.timestamp
                      ? new Date(latestMessage.timestamp).getTime()
                      : Date.now(),
                  };
                }
                return conv;
              })
            );
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setError("Request was cancelled");
        } else {
          console.error("Error in chat:", error);
        }
      } finally {
        setIsLoading(false);
        setStreamingMessageReasoning("");
        setCurrentRequestId(null);
      }
    },
    [activeUser, activeConversation, input, messages, fetchMessages]
  );

  // Memoize chat input related values
  const chatInputValue = useMemo<ChatInputContextType>(
    () => ({
      input,
      setInput,
      isLoading,
      setIsLoading,
      handleChatRequest,
      cancelRequest,
    }),
    [input, setInput, isLoading, setIsLoading, handleChatRequest, cancelRequest]
  );

  // Memoize the main context value
  const contextValue = useMemo(
    () => ({
      activeUser,
      setActiveUser,
      apiKeys,
      setApiKeys,
      activeConversation,
      setActiveConversation,
      conversations,
      setConversations,
      prompts,
      setPrompts,
      filteredConversations,
      setFilteredConversations,
      isSearchOpen,
      setIsSearchOpen,
      searchTerm,
      setSearchTerm,
      searchRef,
      messages,
      setMessages,
      newConversation,
      setNewConversation,
      title,
      setTitle,
      streamingMessage,
      setStreamingMessage,
      handleResetChat,
      devAPIKeys,
      setDevAPIKeys,
      fetchDevAPIKeys,
      getUserConversations,
      alertForUser,
      setAlertForUser,
      fetchApiKey,
      fetchPrompts,
      fetchMessages,
      error,
      setError,
      currentRequestId,
      setCurrentRequestId,
      openRouterModels,
      setOpenRouterModels,
      apiKeyInput,
      setApiKeyInput,
      azureModels,
      setAzureModels,
      customModels,
      setCustomModels,
      fetchOpenRouterModels,
      fetchAzureModels,
      fetchCustomModels,
      streamingMessageReasoning,
      setStreamingMessageReasoning,
    }),
    [
      activeUser,
      apiKeys,
      activeConversation,
      conversations,
      prompts,
      filteredConversations,
      isSearchOpen,
      searchTerm,
      messages,
      newConversation,
      title,
      streamingMessage,
      handleResetChat,
      devAPIKeys,
      fetchDevAPIKeys,
      getUserConversations,
      alertForUser,
      fetchApiKey,
      fetchPrompts,
      fetchMessages,
      error,
      currentRequestId,
      openRouterModels,
      apiKeyInput,
      setApiKeyInput,
      azureModels,
      setAzureModels,
      customModels,
      setCustomModels,
      fetchOpenRouterModels,
      fetchAzureModels,
      fetchCustomModels,
      streamingMessageReasoning,
      setStreamingMessageReasoning,
    ]
  );

  return (
    <UserContext.Provider value={contextValue}>
      <ChatInputContext.Provider value={chatInputValue}>
        {children}
      </ChatInputContext.Provider>
    </UserContext.Provider>
  );
};

export { UserProvider, UserContext };
