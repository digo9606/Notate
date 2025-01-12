import AddNewModel from "./AddNewModel";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useUser } from "@/context/useUser";
import { useSysSettings } from "@/context/useSysSettings";
import { useState } from "react";
import { FolderOpenIcon, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tooltip } from "@/components/ui/tooltip";
import { TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const formatDirectoryPath = (path: string | null) => {
  if (!path) return "Not set";
  const parts = path.split("/");
  const lastTwoParts = parts.slice(-2);
  return `.../${lastTwoParts.join("/")}`;
};

export default function LocalModels() {
  const [selectedModel, setSelectedModel] = useState<string>("");
  const { activeUser } = useUser();
  const {
    localModels,
    handleRunOllama,
    localModalLoading,
    progressLocalOutput,
    progressRef,
    setLocalModelDir,
    localModelDir,
  } = useSysSettings();

  const handleSelectDirectory = async () => {
    try {
      const dirPath = await window.electron.openDirectory();
      if (dirPath) {
        console.log('Selected directory path:', dirPath);
        setLocalModelDir(dirPath);
        const DirModels = await window.electron.getDirModels(dirPath);
        console.log('Directory models:', DirModels);
        toast({
          title: "Directory selected",
          description: `Selected directory: ${dirPath}`,
        });
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      toast({
        title: "Error",
        description: "Failed to select directory",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <TooltipProvider>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <p className="truncate flex-1">{formatDirectoryPath(localModelDir)}</p>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-[300px] break-all">
              <p>{localModelDir || "No directory selected"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button onClick={handleSelectDirectory} variant="outline" className="ml-2">
          <FolderOpenIcon className="w-4 h-4 mr-2" />
          Select Directory
        </Button>
      </div>

      <Select value={selectedModel} onValueChange={setSelectedModel}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a local model" />
        </SelectTrigger>
        <SelectContent>
          {localModels.map((model) => (
            <SelectItem key={model.digest || model.name} value={model.name}>
              {model.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        onClick={() => {
          if (activeUser) {
            handleRunOllama(selectedModel, activeUser);
            toast({
              title: "Model loading",
              description: `Loading ${selectedModel}...`,
            });
          }
        }}
        disabled={localModalLoading || !selectedModel}
        className={`w-full relative ${
          localModalLoading ? "animate-pulse bg-primary/80" : ""
        }`}
      >
        {localModalLoading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin h-4 w-4" />
            <span>Starting Model...</span>
          </div>
        ) : (
          <>Run Model</>
        )}
      </Button>

      {progressLocalOutput.length > 0 && (
        <div
          ref={progressRef}
          className="mt-4 bg-secondary/50 rounded-[6px] p-4 h-48 overflow-y-auto font-mono text-xs"
        >
          {progressLocalOutput.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </div>
      )}

      <AddNewModel />
    </div>
  );
}
