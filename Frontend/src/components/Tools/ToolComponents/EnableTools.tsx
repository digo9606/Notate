import { Button } from "@/components/ui/button";
import { useUser } from "@/context/useUser";
import { Globe } from "lucide-react";
import { useEffect } from "react";

const toolIcons = {
  "Web Search": <Globe />,
};

export default function EnableTools() {
  const { dockTool, systemTools, userTools } = useUser();

  useEffect(() => {
    // Only log in development
    if (process.env.NODE_ENV === "development") {
      console.log("User Tools:", userTools);
      console.log("System Tools:", systemTools);
    }
  }, [userTools, systemTools]);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {systemTools.map((tool) => {
          const userTool = userTools.find((t) => t.name === tool.name);
          return (
            <div
              key={tool.name}
              className="flex flex-col gap-2 items-center justify-center"
            >
              <Button
                variant={userTool?.docked === 1 ? "default" : "outline"}
                className="w-full h-full"
                onClick={() =>
                  dockTool(
                    userTool || {
                      ...tool,
                      enabled: 1,
                      docked: 1,
                    }
                  )
                }
              >
                {toolIcons[tool.name as keyof typeof toolIcons] || tool.name}
                {tool.name}
              </Button>
            </div>
          );
        })}
        <Button variant="outline" disabled>
          More Coming Soon
        </Button>
      </div>
    </div>
  );
}
