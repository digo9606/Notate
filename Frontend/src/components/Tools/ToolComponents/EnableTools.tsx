import { Button } from "@/components/ui/button";
import { useUser } from "@/context/useUser";
import { Globe } from "lucide-react";

const toolIcons = {
  "Web Search": <Globe />,
};

export default function EnableTools() {
  const { dockTool, systemTools, userTools } = useUser();

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {systemTools.map((tool) => (
          <div
            key={tool.name}
            className="flex flex-col gap-2 items-center justify-center"
          >
            <Button
              variant={
                userTools.some(
                  (t) =>
                    t.docked === 1 &&
                    t.name.toLowerCase() === tool.name.toLowerCase()
                )
                  ? "default"
                  : "outline"
              }
              className="w-full h-full"
              onClick={() =>
                dockTool({
                  id: tool.id,
                  name: tool.name,
                  enabled: 1,
                  docked: 1,
                })
              }
            >
              {toolIcons[tool.name as keyof typeof toolIcons] || tool.name}
              {tool.name}
            </Button>
          </div>
        ))}
        <Button variant="outline" disabled>
          More Coming Soon
        </Button>
      </div>
    </div>
  );
}
