import { useUser } from "@/context/useUser";

export const StreamingReasoningMessage = () => {
  const { streamingMessageReasoning } = useUser();

  return (
    <div className="flex flex-col gap-2 my-4">
      <div className="text-sm text-muted-foreground bg-muted p-4 rounded-lg">
        <div className="font-semibold mb-2">Reasoning:</div>
        <div className="whitespace-pre-wrap">{streamingMessageReasoning}</div>
      </div>
    </div>
  );
}; 