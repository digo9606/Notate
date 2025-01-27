import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate } from "@/lib/utils";
import { Loader2, PlusCircle, ArrowDown } from "lucide-react";
import { StreamingMessage } from "./ChatComponents/StreamingMessage";
import { ChatMessage } from "./ChatComponents/ChatMessage";
import { ChatInput } from "./ChatComponents/ChatInput";
import { LoadingIndicator } from "./ChatComponents/LoadingIndicator";
import { Button } from "@/components/ui/button";
import { useUser } from "@/context/useUser";
import { IngestProgress } from "@/components/CollectionModals/CollectionComponents/IngestProgress";
import logo from "@/assets/icon.png";
import { useSysSettings } from "@/context/useSysSettings";
import { useView } from "@/context/useView";
import { NewConvoWelcome } from "./ChatComponents/NewConvoWelcome";
import { useChatInput } from "@/context/useChatInput";
import { StreamingReasoningMessage } from "./ChatComponents/StreamingReasoningMessage";
export default function Chat() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [resetCounter, setResetCounter] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const {
    handleResetChat: originalHandleResetChat,
    streamingMessage,
    setStreamingMessage,
    streamingMessageReasoning,
    setStreamingMessageReasoning,
    activeUser,
    messages,
    setMessages,
    error,
    setCurrentRequestId,
  } = useUser();

  const { isLoading, setIsLoading } = useChatInput();
  const { setActiveView } = useView();

  const { localModalLoading } = useSysSettings();

  // Reset hasUserScrolled when starting a new conversation
  useEffect(() => {
    if (messages.length === 0) {
      setHasUserScrolled(false);
      setShouldAutoScroll(true);
    }
  }, [messages.length]);

  // Improved scroll position tracking
  useEffect(() => {
    const scrollElement = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );

    const handleScroll = () => {
      if (!scrollElement) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      const needsScroll = scrollHeight > clientHeight;

      setShowScrollButton(!isNearBottom && needsScroll);
      setShouldAutoScroll(isNearBottom);

      if (!hasUserScrolled && !isNearBottom) {
        setHasUserScrolled(true);
      }
    };

    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll, { passive: true });
      // Initial check when component mounts
      handleScroll();
      return () => {
        scrollElement.removeEventListener("scroll", handleScroll);
      };
    }
  }, [hasUserScrolled]);

  // Smooth scroll to bottom function
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const scrollElement = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );

    if (scrollElement) {
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior,
      });
      setShouldAutoScroll(true);
      setHasUserScrolled(false);
    }
  };

  // Modified scroll effect with improved timing
  useEffect(() => {
    if ((shouldAutoScroll || !hasUserScrolled) && messages.length > 0) {
      const timeoutId = setTimeout(() => {
        scrollToBottom("instant");
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [
    messages,
    streamingMessage,
    isLoading,
    shouldAutoScroll,
    hasUserScrolled,
  ]);

  const handleResetChat = async () => {
    await originalHandleResetChat();
    setResetCounter((c) => c + 1);
    setHasUserScrolled(false);
    setShouldAutoScroll(true);
  };

  // This signals to the backend that the user is streaming a message and updates the UI
  useEffect(() => {
    let newMessage: string = "";
    let newReasoning: string = "";
    let isSubscribed = true; // Add a flag to prevent updates after unmount

    const handleMessageChunk = (chunk: string) => {
      if (!isSubscribed) return; // Skip if component is unmounted
      if (chunk.startsWith("[REASONING]:")) {
        newReasoning += chunk.replace("[REASONING]:", "");
        setStreamingMessageReasoning(newReasoning);
      } else {
        newMessage += chunk;
        setStreamingMessage(newMessage);
      }
    };

    const handleStreamEnd = () => {
      if (!isSubscribed) return;

      const finalMessage = newMessage;
      const finalReasoning = newReasoning;

      setMessages((prevMessages) => {
        const lastMessage = prevMessages[prevMessages.length - 1];
        if (!lastMessage || lastMessage.role === "user") {
          return [
            ...prevMessages,
            {
              role: "assistant",
              content: finalMessage,
              reasoning_content: finalReasoning,
              timestamp: new Date(),
            },
          ];
        } else if (lastMessage.role === "assistant") {
          const updatedMessage = {
            ...lastMessage,
            content: finalMessage,
            reasoning_content: finalReasoning,
          };
          return [...prevMessages.slice(0, -1), updatedMessage];
        }
        return prevMessages;
      });

      // Ensure we stay at bottom when message completes
      if (!hasUserScrolled) {
        requestAnimationFrame(() => {
          if (!isSubscribed) return;
          const scrollElement = scrollAreaRef.current?.querySelector(
            "[data-radix-scroll-area-viewport]"
          );
          if (scrollElement) {
            scrollElement.scrollTo({
              top: scrollElement.scrollHeight,
              behavior: "instant",
            });
          }
          setStreamingMessage("");
          setStreamingMessageReasoning("");
          setIsLoading(false);
          setCurrentRequestId(null);
        });
      } else {
        // If user has scrolled, just update the state without forcing scroll
        setStreamingMessage("");
        setStreamingMessageReasoning("");
        setIsLoading(false);
        setCurrentRequestId(null);
      }

      newMessage = "";
      newReasoning = "";
    };

    // Remove any existing listeners before adding new ones
    window.electron.offMessageChunk(handleMessageChunk);
    window.electron.offStreamEnd(handleStreamEnd);

    // Add new listeners
    window.electron.onMessageChunk(handleMessageChunk);
    window.electron.onStreamEnd(handleStreamEnd);

    return () => {
      isSubscribed = false; // Set flag to prevent updates after unmount
      // Clean up listeners
      window.electron.offMessageChunk(handleMessageChunk);
      window.electron.offStreamEnd(handleStreamEnd);
    };
  }, [
    setIsLoading,
    setMessages,
    setStreamingMessage,
    setStreamingMessageReasoning,
    setCurrentRequestId,
  ]);

  useEffect(() => {
    if (!activeUser) {
      setActiveView("SelectAccount");
    }
  }, [activeUser, setActiveView]);

  return (
    <div className="pt-5 h-[calc(100vh-1rem)] flex flex-col">
      <div className={`flex flex-col h-full overflow-hidden relative`}>
        <div className="p-2 bg-card border-b border-secondary flex items-center">
          <div className="flex items-center flex-1">
            <img src={logo} alt="logo" className="h-6 w-6 mr-2" />

            <h1 className="text-2xl font-bold">Notate</h1>
          </div>
          <div className="flex-1 flex justify-center">
            {localModalLoading && (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin h-4 w-4" />
                <span>Loading local model...</span>
              </div>
            )}
            <IngestProgress truncate={true} />
          </div>
          <div className="flex-1 flex justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                handleResetChat();
              }}
            >
              <PlusCircle className="mr-2" /> New Chat
            </Button>
          </div>
        </div>

        <ScrollArea
          ref={scrollAreaRef}
          className={`flex-grow px-4 relative`}
          style={{ height: "calc(100% - 8rem)" }}
        >
          {" "}
          {messages.length === 0 && <NewConvoWelcome key={resetCounter} />}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`message ${
                message.role === "user" ? "user-message" : "ai-message"
              }`}
              data-testid={`chat-message-${message.role}`}
            >
              <ChatMessage message={message} formatDate={formatDate} />
            </div>
          ))}
          {streamingMessageReasoning && <StreamingReasoningMessage />}
          {error && (
            <div className="text-red-500 mt-4 p-2 bg-red-100 rounded">
              Error: {error}
            </div>
          )}{" "}
          {streamingMessage && <StreamingMessage content={streamingMessage} />}
          <div ref={bottomRef} />
        </ScrollArea>

        {showScrollButton && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute bottom-32 right-8 rounded-full shadow-lg hover:shadow-xl transition-all"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}

        {isLoading && (
          <div className="flex justify-center">
            <LoadingIndicator />
          </div>
        )}

        <div className="">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}
