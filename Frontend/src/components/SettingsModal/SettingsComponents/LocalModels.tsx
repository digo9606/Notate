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
import {
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const formatDirectoryPath = (path: string | null) => {
  if (!path) return "Not set";
  const parts = path.split("/");
  const lastTwoParts = parts.slice(-2);
  return `.../${lastTwoParts.join("/")}`;
};

const formatModelName = (name: string) => {
  const parts = name.split("-");
  if (parts.length <= 2) return name;
  return `${parts[0]}-${parts[1]}...`;
};

export default function LocalModels() {
  const [selectedModel, setSelectedModel] = useState<string>("");
  const { activeUser } = useUser();
  const {
    localModels = [],
    setLocalModels,
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
        console.log("Selected directory path:", dirPath);
        setLocalModelDir(dirPath);
        const response = (await window.electron.getDirModels(
          dirPath
        )) as unknown as { dirPath: string; models: Model[] };
        console.log("Directory models:", response);
        setLocalModels(response.models);
        toast({
          title: "Directory selected",
          description: `Selected directory: ${dirPath}`,
        });
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
      toast({
        title: "Error",
        description: "Failed to select directory",
        variant: "destructive",
      });
    }
  };

  const handleRunModel = async (
    model_name: string,
    model_location: string,
    model_type: string,
    user_id: string
  ) => {
    if (activeUser) {
      window.electron.loadModel({
        model_location: model_location,
        model_name: model_name,
        model_type: model_type,
        user_id: Number(user_id),
      });
      toast({
        title: "Model loading",
        description: `Loading ${model_name}...`,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <TooltipProvider>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <p className="truncate flex-1">
                {formatDirectoryPath(localModelDir)}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="start"
              className="max-w-[300px] break-all"
            >
              <p>{localModelDir || "No directory selected"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          onClick={handleSelectDirectory}
          variant="outline"
          className="ml-2"
        >
          <FolderOpenIcon className="w-4 h-4 mr-2" />
          Select Directory
        </Button>
      </div>

      <Select value={selectedModel} onValueChange={setSelectedModel}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a local model" />
        </SelectTrigger>
        <SelectContent>
          {Array.isArray(localModels) &&
            localModels.map((model) => (
              <SelectItem key={model.digest || model.name} value={model.name}>
                {formatModelName(model.name)} ({model.type})
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      <Button
        onClick={() => {
          if (activeUser) {
            // selectedModelPath
            const selectedModelPath = localModels.find(
              (model) => model.name === selectedModel
            )?.model_location;
            console.log("selectedModelPath", selectedModelPath);
            const selectedModelType = localModels.find(
              (model) => model.name === selectedModel
            )?.type;
            console.log("selectedModelType", selectedModelType);
            if (selectedModelPath && selectedModelType) {
              handleRunModel(
                selectedModel,
                selectedModelPath,
                selectedModelType,
                activeUser.id.toString()
              );
              toast({
                title: "Model loading",
                description: `Loading ${selectedModel}...`,
              });
            }
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
              {typeof line === "string" ? line : JSON.stringify(line, null, 2)}
            </div>
          ))}
        </div>
      )}

      <AddNewModel />
    </div>
  );
}
