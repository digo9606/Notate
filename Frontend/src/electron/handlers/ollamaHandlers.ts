import { ipcMainHandle } from "../util.js";
import { fetchOllamaModels } from "../ollama/fetchLocalModels.js";
import { systemSpecs } from "../specs/systemSpecs.js";
import { runOllama } from "../ollama/runOllama.js";
import { pullModel } from "../ollama/pullModel.js";
import { checkOllama } from "../ollama/checkOllama.js";
import db from "../db.js";
import log from "electron-log";

export async function setupOllamaHandlers() {
  ipcMainHandle("getPlatform", async () => {
    return { platform: process.platform as "win32" | "darwin" | "linux" };
  });

  ipcMainHandle("systemSpecs", async () => {
    try {
      const { cpu, vram, GPU_Manufacturer } = await systemSpecs();
      return { cpu, vram, GPU_Manufacturer };
    } catch (error) {
      console.error("Error in systemSpecs:", error);
      return { cpu: "Unknown", vram: "Unknown", GPU_Manufacturer: "Unknown" };
    }
  });

  ipcMainHandle("checkOllama", async () => {
    try {
      const isOllamaRunning = await checkOllama();
      return { isOllamaRunning };
    } catch (error) {
      console.error("Error checking Ollama:", error);
      return { isOllamaRunning: false };
    }
  });

  ipcMainHandle("fetchOllamaModels", async () => {
    try {
      const models = await fetchOllamaModels();
      return { models };
    } catch (error) {
      console.error("Error in fetchOllamaModels:", error);
      return { models: [] };
    }
  });

  ipcMainHandle("pullModel", async (_, { model }: { model: string }) => {
    await pullModel(model);
    return { model };
  });

  ipcMainHandle(
    "runOllama",
    async (
      _event,
      { model, user }: { model: string; user: User }
    ): Promise<{ model: string; user: User }> => {
      try {
        await checkOllama();
        await runOllama({ model });

        db.updateUserSettings(user.id, "provider", "ollama");
        db.updateUserSettings(user.id, "model", model);
        return { model, user };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error("Error running Ollama:", error);
        throw new Error(errorMessage);
      }
    }
  );

  const isOllamaRunning = await checkOllama();
  if (isOllamaRunning) {
    log.info("Ollama is running, pulling model...");
    try {
      await pullModel("granite-embedding:278m");
    } catch (error) {
      log.info("Error pulling model (You probably arent running ollama) :", error);
    }
  }
}
