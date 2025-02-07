import { Button } from "@/components/ui/button";
import { MessageSquare, X } from "lucide-react";
import notateLogo from "@/assets/icon.png";
import { useChatInput } from "@/context/useChatInput";
import { useLibrary } from "@/context/useLibrary";
import { docSuggestions, suggestions } from "./suggestions";
import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function NewConvoWelcome() {
  const { handleChatRequest } = useChatInput();
  const { selectedCollection, setSelectedCollection, setShowUpload } =
    useLibrary();

  const randomDocSuggestions = useMemo(() => {
    const shuffled = [...docSuggestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }, []);

  const randomSuggestions = useMemo(() => {
    const shuffled = [...suggestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }, []);

  const handleSuggestionClick = (suggestion: string) => {
    handleChatRequest(
      selectedCollection?.id || undefined,
      suggestion,
      undefined
    );
  };

  return (
    <div className="!h-full flex-1 flex flex-col items-center justify-center px-4  text-center">
      <div className="space-y-4 md:space-y-6 w-full max-w-[600px]">
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center justify-center mx-auto my-3 md:my-4">
            <img
              src={notateLogo}
              alt="Notate Logo"
              className="w-10 h-10 md:w-12 md:h-12"
            />
          </div>
          <h2 className="text-xl md:text-2xl font-bold">
            Welcome to Notate! 👋
          </h2>
          <p className="text-sm md:text-base text-muted-foreground px-2">
            Your friendly AI assistant. Ask me anything about your documents,
            videos, and web content.
          </p>
        </div>

        <div className="grid gap-3 md:gap-4 w-full">
          <div className="grid gap-2 w-full">
            {selectedCollection && (
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                Currently viewing:
                <span className="font-semibold text-[#ffffff] max-w-[200px] truncate">
                  {selectedCollection.name}
                </span>
                <button
                  className="text-red-500 hover:text-red-600 flex items-center"
                  onClick={() => {
                    setSelectedCollection(null);
                    setShowUpload(false);
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </p>
            )}
            <div className="grid gap-2 w-full">
              {selectedCollection
                ? randomDocSuggestions.map((suggestion, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      className="justify-start text-left h-auto py-3 px-4 hover:bg-accent text-xs md:text-sm transition-colors w-full overflow-hidden"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4 mr-2 flex-shrink-0" />
                      <span className="truncate">{suggestion}</span>
                    </Button>
                  ))
                : randomSuggestions.map((suggestion, i) => (
                    <TooltipProvider key={i}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            className="justify-start text-left h-auto py-3 px-4 hover:bg-accent text-xs md:text-sm transition-colors w-full overflow-hidden"
                            onClick={() => handleSuggestionClick(suggestion)}
                          >
                            <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4 mr-2 flex-shrink-0" />
                            <span className="truncate">{suggestion}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{suggestion}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
