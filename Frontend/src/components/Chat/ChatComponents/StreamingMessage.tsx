import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { SyntaxHighlightedCode } from "@/components/Chat/ChatComponents/SyntaxHightlightedCode";
import { useState, useEffect } from "react";
import { providerIcons } from "@/components/SettingsModal/SettingsComponents/providerIcons";
import { useSysSettings } from "@/context/useSysSettings";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const MotionAvatar = motion.create(Avatar);

export function StreamingMessage({ content }: { content: string }) {
  const [parsedContent, setParsedContent] = useState<(string | JSX.Element)[]>(
    []
  );
  const { settings } = useSysSettings();
  useEffect(() => {
    const parts: (string | JSX.Element)[] = [];
    let codeBlock = "";
    let isInCodeBlock = false;
    let language = "";

    const lines = content.split("\n");

    for (const line of lines) {
      if (line.startsWith("```")) {
        if (isInCodeBlock) {
          parts.push(
            <SyntaxHighlightedCode
              key={parts.length}
              code={codeBlock.trim()}
              language={language}
            />
          );
          codeBlock = "";
          isInCodeBlock = false;
          language = "";
        } else {
          isInCodeBlock = true;
          language = line.slice(3).trim() || "text";
        }
      } else if (isInCodeBlock) {
        codeBlock += line + "\n";
      } else {
        parts.push(
          ...line.split("").map((char, index) => (
            <span key={`${parts.length}-${index}`} className="animate-fade-in">
              {char}
            </span>
          ))
        );
        parts.push(<br key={`${parts.length}-br`} />);
      }
    }

    if (isInCodeBlock) {
      parts.push(
        <SyntaxHighlightedCode
          key={parts.length}
          code={codeBlock.trim()}
          language={language}
        />
      );
    }

    setParsedContent(parts);
  }, [content]);

  return (
    <div className="flex justify-start animate-in fade-in duration-300 mx-2 my-2">
      <div className="flex flex-row items-end max-w-[80%]">
        <div className="relative">
          <MotionAvatar 
            className="relative z-10 w-9 h-9 border-2 shadow-sm"
            style={{
              "--pulse-color": "hsl(var(--primary) / 0.3)",
              "--duration": "2s",
            } as React.CSSProperties}
          >
            <motion.div 
              className="h-full w-full flex items-center justify-center"
            >
              {settings.provider ? (
                providerIcons[settings.provider as keyof typeof providerIcons]
              ) : (
                <AvatarImage
                  className="object-cover w-full h-full scale-125"
                  src="/src/assets/avatars/ai-avatar.png"
                />
              )}
            </motion.div>
          </MotionAvatar>
          <motion.div 
            className={cn(
              "absolute left-1/2 top-1/2 w-full h-full -translate-x-1/2 -translate-y-1/2",
              "rounded-full animate-pulse"
            )}
            style={{
              "--pulse-color": "hsl(var(--primary) / 0.3)",
              "--duration": "2s",
            } as React.CSSProperties}
          />
          <motion.div 
            className={cn(
              "absolute left-1/2 top-1/2 w-[120%] h-[120%] -translate-x-1/2 -translate-y-1/2",
              "rounded-full animate-pulse"
            )}
            style={{
              "--pulse-color": "hsl(var(--primary) / 0.2)",
              "--duration": "2s",
            } as React.CSSProperties}
          />
        </div>
        <div className="mx-2 my-1 p-3 rounded-2xl bg-secondary text-secondary-foreground shadow-md rounded-bl-none">
          <div className="text-sm whitespace-pre-wrap break-words text-left">
            {parsedContent}
          </div>
        </div>
      </div>
    </div>
  );
}
