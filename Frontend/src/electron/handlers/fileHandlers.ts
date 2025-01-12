import { ipcMainDatabaseHandle } from "../util.js";
import { openCollectionFolderFromFileExplorer } from "../storage/openCollectionFolder.js";
import { getUserCollectionFiles } from "../storage/getUserFiles.js";
import { removeFileorFolder } from "../storage/removeFileorFolder.js";
import { renameFile } from "../storage/renameFile.js";
import fs from "fs";
import path from "path";

async function getDirModels(payload: { dirPath: string }): Promise<string[]> {
  const { dirPath } = payload;

  console.log("Checking directory:", dirPath);
  if (!fs.existsSync(dirPath)) {
    console.log("Directory does not exist");
    return [];
  }

  // List contents of the directory to debug
  const contents = fs.readdirSync(dirPath);
  console.log("Directory contents:", contents);

  // For Ollama models, we need to check the manifests directory
  const manifestsDir = path.join(dirPath, "manifests");
  console.log("Checking manifests directory:", manifestsDir);

  if (fs.existsSync(manifestsDir)) {
    try {
      const models = new Set<string>();

      // Check registry.ollama.ai/library for official models
      const registryPath = path.join(
        manifestsDir,
        "registry.ollama.ai",
        "library"
      );
      if (fs.existsSync(registryPath)) {
        const entries = fs.readdirSync(registryPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            console.log("Found model:", entry.name);
            models.add(entry.name);
          }
        }
      }

      // Check hf.co for HuggingFace models
      const hfPath = path.join(manifestsDir, "hf.co");
      if (fs.existsSync(hfPath)) {
        const processHFDir = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              const subEntries = fs.readdirSync(path.join(dir, entry.name), {
                withFileTypes: true,
              });
              for (const subEntry of subEntries) {
                if (subEntry.isDirectory() && !subEntry.name.startsWith(".")) {
                  console.log("Found HF model:", subEntry.name);
                  models.add(subEntry.name);
                }
              }
            }
          }
        };
        processHFDir(hfPath);
      }

      return Array.from(models);
    } catch (err) {
      console.error("Error reading models directory:", err);
      return [];
    }
  } else {
    console.log("No manifests directory found");
  }

  return [];
}

export function setupFileHandlers() {
  ipcMainDatabaseHandle("getUserCollectionFiles", async (payload) => {
    const result = await getUserCollectionFiles(payload);
    return result;
  });

  ipcMainDatabaseHandle("getDirModels", async (payload) => {
    console.log("getDirModels", payload);
    const models = await getDirModels(payload);
    console.log("models", models);
    return { dirPath: payload.dirPath, models };
  });
  ipcMainDatabaseHandle(
    "openCollectionFolderFromFileExplorer",
    async (payload) => {
      const result = await openCollectionFolderFromFileExplorer(
        payload.filepath
      );
      return result;
    }
  );

  ipcMainDatabaseHandle("removeFileorFolder", async (payload) => {
    const result = await removeFileorFolder(payload);
    return result;
  });

  ipcMainDatabaseHandle("renameFile", async (payload) => {
    const result = await renameFile(payload);
    return result;
  });
}
