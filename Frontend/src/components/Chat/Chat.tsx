import { ArrowDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/context/useUser";
import { useChatInput } from "@/context/useChatInput";
import { useChatLogic } from "@/hooks/useChatLogic";
import { ChatMessagesArea } from "./ChatComponents/ChatMessagesArea";
import { ChatInput } from "./ChatComponents/ChatInput";
import { LoadingIndicator } from "./ChatComponents/LoadingIndicator";
import { useSysSettings } from "@/context/useSysSettings";
import { IngestProgress } from "../CollectionModals/CollectionComponents/IngestProgress";

export default function Chat() {
  const {
    scrollAreaRef,
    resetCounter,
    bottomRef,
    showScrollButton,
    scrollToBottom,
  } = useChatLogic();
  const { localModalLoading } = useSysSettings();
  const { streamingMessage, streamingMessageReasoning, messages, error } =
    useUser();

  const { isLoading } = useChatInput();

  return (
    <div className="pt-5 h-[calc(100vh-1rem)] flex flex-col">
      <div className={`flex flex-col h-full overflow-hidden relative`}>
        <ChatMessagesArea
          scrollAreaRef={scrollAreaRef}
          messages={messages}
          streamingMessage={streamingMessage}
          streamingMessageReasoning={streamingMessageReasoning}
          error={error}
          resetCounter={resetCounter}
          bottomRef={bottomRef}
        />

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
        <div className="flex-1 flex justify-center">
          {localModalLoading && (
            <div className="flex items-center gap-2">
              <Loader2 className="animate-spin h-4 w-4" />
              <span>Loading local model...</span>
            </div>
          )}
          <IngestProgress truncate={true} />
        </div>
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
