import { BrainCircuit, ChevronDown, ChevronUp } from "lucide-react";
import { useState, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useUser } from "@/context/useUser";

export const StreamingReasoningMessage = () => {
  const { streamingMessageReasoning } = useUser();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-2 my-4 w-full justify-center items-center">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={
          {
            "--shimmer-color": "rgba(255, 255, 255, 0.3)",
            "--radius": "1rem",
            "--speed": "5s",
          } as CSSProperties
        }
        className={cn(
          " bg-secondary/30 group relative z-0 flex max-w-[80%] cursor-pointer items-center justify-between px-3 py-2 overflow-hidden",
          "backdrop-blur-sm border border-secondary/30",
          "transform-gpu transition-all duration-300",
          "hover:bg-secondary/30",
          "[border-radius:var(--radius)]"
        )}
      >
        {/* Shimmer border */}
        <div className="absolute inset-0 -z-20">
          <div
            className="absolute inset-0 animate-border rounded-lg"
            style={{
              background: `linear-gradient(90deg, transparent, var(--shimmer-color), transparent)`,
              backgroundSize: "200% 100%",
              maskImage: `linear-gradient(black, black), linear-gradient(black, black)`,
              maskSize: "100% 100%",
              maskPosition: "0 0, 100% 0",
              maskRepeat: "no-repeat",
              WebkitMaskComposite: "destination-out",
              maskComposite: "exclude",
            }}
          />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <BrainCircuit className="w-4 h-4 text-primary/70" />{" "}
          </div>
          <span className="text-sm font-medium text-primary/90">
            Chain of Thought
          </span>
          <span className="text-xs text-primary/60">
            thinking
            <span className="inline-flex">
              <span className="animate-[dot_1.4s_infinite] [animation-delay:0.0s]">
                .
              </span>
              <span className="animate-[dot_1.4s_infinite] [animation-delay:0.2s]">
                .
              </span>
              <span className="animate-[dot_1.4s_infinite] [animation-delay:0.4s]">
                .
              </span>
            </span>
          </span>
        </div>
        <div className="text-primary/60">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>

        {/* Background */}
        <div className="absolute -z-30 [background:var(--bg)] [border-radius:var(--radius)] inset-0" />
      </div>

      {isExpanded && (
        <div className="overflow-hidden rounded-lg border border-secondary/30 animate-in slide-in-from-top-2 duration-200 w-[80%]">
          <div className="px-4 py-2.5 border-b border-secondary/30 bg-secondary/20 backdrop-blur-sm">
            <div className="text-sm font-medium text-primary/80">
              Reasoning Process
            </div>
          </div>
          <div className="bg-secondary/10 backdrop-blur-sm">
            <div className="px-4 py-3 text-sm break-words [overflow-wrap:anywhere] text-left overflow-hidden contentMarkdown">
              {streamingMessageReasoning}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
