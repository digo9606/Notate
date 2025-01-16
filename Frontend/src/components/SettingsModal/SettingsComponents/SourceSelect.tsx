import { Button } from "@/components/ui/button";
import { useSysSettings } from "@/context/useSysSettings";
import { Globe, Shield } from "lucide-react";

export default function SourceSelect() {
  const { sourceType, setSourceType } = useSysSettings();

  return (
    <div className="flex gap-4">
      <Button
        variant={sourceType === "external" ? "default" : "outline"}
        className="flex-1 h-20"
        onClick={() => setSourceType("external")}
      >
        <div className="flex flex-col items-center gap-2">
          <Globe className="h-6 w-6" />
          <span>External API</span>
        </div>
      </Button>
      <Button
        variant={sourceType === "local" ? "default" : "outline"}
        className="flex-1 h-20"
        onClick={() => setSourceType("local")}
      >
        <div className="flex flex-col items-center gap-2">
          <Shield className="h-6 w-6" />
          <span>Local Models</span>
        </div>
      </Button>
    </div>
  );
}
