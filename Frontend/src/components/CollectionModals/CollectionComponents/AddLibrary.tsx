import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Cloud, Database } from "lucide-react";
import { useState } from "react";
import { sanitizeStoreName } from "@/lib/utils";
import { useUser } from "@/context/useUser";
import { useLibrary } from "@/context/useLibrary";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AddLibrary() {
  const [newStore, setNewStore] = useState("");
  const [newStoreError, setNewStoreError] = useState<string | null>(null);
  const [newStoreDescription, setNewStoreDescription] = useState("");
  const [isLocal, setIsLocal] = useState(true);
  const [localEmbeddingModel, setLocalEmbeddingModel] = useState(
    "HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5"
  );
  const [newStoreType, setNewStoreType] = useState("Notes");
  const { activeUser, apiKeys } = useUser();

  const {
    setUserCollections,
    setSelectedCollection,
    setShowUpload,
    setShowAddStore,
    setFiles,
  } = useLibrary();

  const handleCreateCollection = async () => {
    if (!activeUser) return;

    const cleanedStore = await sanitizeStoreName(newStore);

    if (!apiKeys.find((key) => key.provider === "openai")) {
      setIsLocal(true);
      setLocalEmbeddingModel(
        "HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5"
      );
    }

    const newCollection = (await window.electron.createCollection(
      activeUser.id,
      cleanedStore,
      newStoreDescription,
      newStoreType,
      isLocal,
      localEmbeddingModel
    )) as unknown as Collection;

    if (newCollection.id === undefined) {
      setNewStoreError("This name is already in use");
      return;
    }

    window.electron.updateUserSettings(
      activeUser.id,
      "vectorstore",
      newCollection.id.toString()
    );

    setUserCollections((prevCollections) => [
      ...prevCollections,
      newCollection,
    ]);
    setShowAddStore(false);
    setFiles([]);
    setNewStore("");
    setNewStoreDescription("");
    setNewStoreType("Notes");
    setSelectedCollection(newCollection);
    setShowUpload(true);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <div className="col-span-4">
            <div className="grid grid-cols-3 items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="col-span-1"
                onClick={() => setShowAddStore(false)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Label
                htmlFor="newStore"
                className="col-span-2 text-left text-lg"
              >
                Create a new store
              </Label>
            </div>
          </div>
        </div>

        <div className="rounded-[6px] p-4 bg-gradient-to-br from-secondary/50 via-secondary/30 to-background border">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="newStore" className="text-right">
              Store Name
            </Label>
            <div className="col-span-3">
              {newStoreError && (
                <p className="text-destructive text-sm mb-2">{newStoreError}</p>
              )}
              <Textarea
                id="newStore"
                placeholder="Enter store name"
                value={newStore}
                onChange={(e) => {
                  setNewStore(e.target.value);
                  setNewStoreError(null);
                }}
                className="resize-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4 mt-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <div className="col-span-3">
              <Textarea
                id="description"
                placeholder="Enter store description (optional)"
                value={newStoreDescription}
                onChange={(e) => setNewStoreDescription(e.target.value)}
                className="resize-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="storeLocation" className="text-right">
              Embeddings
            </Label>
            <div className="col-span-3">
              <div className="flex gap-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          disabled={
                            apiKeys.find((key) => key.provider === "openai") ===
                            undefined
                          }
                          type="button"
                          variant={isLocal ? "outline" : "secondary"}
                          className="flex-1 sm:text-[14px] text-[10px]"
                          onClick={() => setIsLocal(false)}
                        >
                          <Cloud className="h-4 w-4 mr-2" />
                          Open AI
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        You must have an OpenAI API key to use this feature.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  type="button"
                  variant={isLocal ? "secondary" : "outline"}
                  className="flex-1 sm:text-[14px] text-[10px]"
                  onClick={() => setIsLocal(true)}
                >
                  <Database className="h-4 w-4 mr-2" />
                  Local
                </Button>
              </div>
            </div>
          </div>

          {isLocal && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="localEmbeddingModel" className="text-right">
                Embedding Model
              </Label>
              <div className="col-span-3">
                <Select
                  value={localEmbeddingModel}
                  onValueChange={(value) => setLocalEmbeddingModel(value)}
                >
                  <SelectTrigger id="localEmbeddingModel">
                    <SelectValue placeholder="Select embedding model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5">
                      Default:
                      HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="storeType" className="text-right">
              Store Type
            </Label>
            <div className="col-span-3">
              <Select
                value={newStoreType}
                onValueChange={(value) => setNewStoreType(value)}
              >
                <SelectTrigger id="storeType">
                  <SelectValue placeholder="Select store type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Notes">Notes</SelectItem>
                  <SelectItem value="Chats">Chats</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-4 pt-4 border-t">
        <Button
          type="button"
          onClick={() => setShowAddStore(false)}
          className="w-32"
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleCreateCollection} className="w-32">
          Create Store
        </Button>
      </div>
    </div>
  );
}
