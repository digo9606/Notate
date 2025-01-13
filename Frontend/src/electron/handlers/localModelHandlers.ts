import { ipcMainDatabaseHandle } from "../util.js";

import { getDirModels } from "../localLLMs/getDirModels.js";
import { unloadModel } from "../localLLMs/unloadModel.js";
import { loadModel } from "../localLLMs/loadModel.js";
import { modelInfo } from "../localLLMs/modelInfo.js";
export function setupLocalModelHandlers() {

  ipcMainDatabaseHandle("getDirModels", async (payload) => {
    console.log("getDirModels", payload);
    const models = await getDirModels(payload);
    console.log("models", models);
    return { dirPath: payload.dirPath, models };
  });

  ipcMainDatabaseHandle("loadModel", async (payload) => {
    try {
      const result = await loadModel(payload);
      return result;
    } catch (error) {
      console.error("Error loading model:", error);
      throw error;
    }
  });

  ipcMainDatabaseHandle("unloadModel", async (payload) => {
    try {
      const result = await unloadModel(payload);
      return result;
    } catch (error) {
      console.error("Error unloading model:", error);
      throw error;
    }
  });

  ipcMainDatabaseHandle("getModelInfo", async (payload) => {
    try {
      const result = await modelInfo(payload);
      return result;
    } catch (error) {
      console.error("Error getting model info:", error);
      throw error;
    }
  });
}
