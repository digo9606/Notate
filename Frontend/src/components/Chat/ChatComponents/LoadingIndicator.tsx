import { useUser } from "@/context/useUser";
import { Loader2 } from "lucide-react";

export function LoadingIndicator() {
  const { streamingMessage } = useUser();
  return (
    <div className="flex justify-center my-4">
      <div className="flex items-center bg-secondary/50 text-secondary-foreground rounded-full px-4 py-2 shadow-md">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">
          {streamingMessage ? "AI is processing..." : "Thinking..."}
        </span>
      </div>
    </div>
  );
}
