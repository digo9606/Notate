import { Download, Loader2, X } from "lucide-react";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSysSettings } from "@/context/useSysSettings";
import { useUser } from "@/context/useUser";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";


export default function AddNewModel() {
  const [newModelName, setNewModelName] = useState("");
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [currentFile, setCurrentFile] = useState<string>();
  const [fileProgress, setFileProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const { localModelDir, localModalLoading, setLocalModalLoading } = useSysSettings();
  const { activeUser } = useUser();

  useEffect(() => {
    const handleProgress = (_: Electron.IpcRendererEvent, message: string | OllamaProgressEvent | DownloadModelProgress) => {
      if (typeof message === 'object' && 'type' in message && message.type === 'progress') {
        const { message: progressMessage, fileName, fileProgress, totalProgress } = message.data;
        setProgressMessage(progressMessage);
        setDownloadProgress(totalProgress);
        if (fileName) setCurrentFile(fileName);
        if (typeof fileProgress === 'number') setFileProgress(fileProgress);
      }
    };

    window.electron.on("download-model-progress", handleProgress);
    return () => {
      window.electron.removeListener("download-model-progress", handleProgress);
    };
  }, []);

  const handleCancel = async () => {
    try {
      const result = await window.electron.cancelDownload();
      if (result.success) {
        toast({
          title: "Download cancelled",
          description: "Model download was cancelled successfully"
        });
      }
    } catch (error) {
      console.error("Error cancelling download:", error);
    } finally {
      setIsDownloading(false);
      setLocalModalLoading(false);
      setDownloadProgress(0);
      setFileProgress(0);
      setProgressMessage("");
      setCurrentFile(undefined);
      setIsAddingModel(false);
    }
  };

  const handleDownload = async () => {
    if (!activeUser || !newModelName.startsWith("hf.co/")) {
      toast({
        title: "Invalid model name",
        description: "Model name must start with 'hf.co/'",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsDownloading(true);
      setLocalModalLoading(true);
      setDownloadProgress(0);
      setFileProgress(0);
      setProgressMessage("Starting download...");
      setCurrentFile(undefined);
      const modelId = newModelName.replace("hf.co/", "");
      
      await window.electron.downloadModel({
        modelId,
        dirPath: `${localModelDir}/${modelId}`,
      });

      toast({
        title: "Success",
        description: `Downloaded model ${modelId}`,
      });
      setIsAddingModel(false);
    } catch (error) {
      toast({
        title: "Error downloading model",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
      setLocalModalLoading(false);
      setDownloadProgress(0);
      setFileProgress(0);
      setProgressMessage("");
      setCurrentFile(undefined);
    }
  };

  return (
    <Dialog open={isAddingModel} onOpenChange={setIsAddingModel}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full mt-4">
          <Plus className="mr-2 h-4 w-4" />
          Add New Model
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a New Model</DialogTitle>
          <DialogDescription>
            Enter a Hugging Face model ID prefixed with "hf.co/"
            (e.g. hf.co/TheBloke/Mistral-7B-v0.1-GGUF)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Input
            placeholder="Enter model name (hf.co/...)"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
          />
          {progressMessage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-secondary-foreground">{progressMessage}</p>
                {isDownloading && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCancel}
                    className="h-6 px-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {currentFile && (
                <>
                  <p className="text-xs text-muted-foreground truncate">{currentFile}</p>
                  <Progress value={fileProgress} className="h-1" />
                </>
              )}
              <Progress value={downloadProgress} className="h-1" />
            </div>
          )}
          <Button
            disabled={localModalLoading}
            onClick={handleDownload}
            className="w-full"
          >
            {localModalLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin h-4 w-4" />
                <span>Downloading Model...</span>
              </div>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Model
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
