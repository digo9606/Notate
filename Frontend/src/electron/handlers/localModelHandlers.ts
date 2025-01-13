import { ipcMainDatabaseHandle } from "../util.js";

import { getDirModels } from "../localLLMs/getDirModels.js";
import { unloadModel } from "../localLLMs/unloadModel.js";
import { loadModel } from "../localLLMs/loadModel.js";
import { modelInfo } from "../localLLMs/modelInfo.js";
import * as fs from "fs";
import * as path from "path";
import { BrowserWindow } from "electron";

let currentDownloadController: AbortController | null = null;

interface DownloadProgress {
  type: "progress";
  data: {
    message: string;
    fileName?: string;
    fileNumber?: number;
    totalFiles?: number;
    fileProgress?: number;
    totalProgress: number;
  };
}

async function downloadModel(payload: {
  modelId: string;
  dirPath: string;
  hfToken?: string;
}) {
  console.log("Downloading model", payload);
  const windows = BrowserWindow.getAllWindows();
  const mainWindow = windows[0];

  const sendProgress = (data: DownloadProgress) => {
    mainWindow?.webContents.send("download-model-progress", data);
  };

  try {
    // Create directory if it doesn't exist
    fs.mkdirSync(payload.dirPath, { recursive: true });

    // Get repository contents from Hugging Face
    const headers: { [key: string]: string } = {
      Accept: "application/json",
    };
    if (payload.hfToken) {
      headers["Authorization"] = `Bearer ${payload.hfToken}`;
    }

    sendProgress({
      type: "progress",
      data: {
        message: "Fetching model information...",
        totalProgress: 0
      }
    });

    currentDownloadController = new AbortController();
    const signal = currentDownloadController.signal;

    const apiUrl = `https://huggingface.co/api/models/${payload.modelId}/tree/main`;
    const response = await fetch(apiUrl, { headers, signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch model info: ${response.statusText}`);
    }

    const files = (await response.json()) as { path: string; size: number }[];
    console.log("Found files:", files);

    // Calculate total size
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    let downloadedSize = 0;

    // Download each file
    for (const [index, file] of files.entries()) {
      const fileName = file.path;
      const downloadUrl = `https://huggingface.co/${payload.modelId}/resolve/main/${fileName}`;
      const filePath = path.join(payload.dirPath, fileName);

      // Create subdirectories if needed
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      console.log(`Downloading ${fileName} to ${filePath}`);
      sendProgress({
        type: "progress",
        data: {
          message: "Downloading file...",
          fileName,
          fileNumber: index + 1,
          totalFiles: files.length,
          fileProgress: 0,
          totalProgress: Math.round((downloadedSize / totalSize) * 100)
        }
      });

      const fileResponse = await fetch(downloadUrl, { headers, signal });

      if (!fileResponse.ok) {
        throw new Error(
          `Failed to download ${fileName}: ${fileResponse.statusText}`
        );
      }

      if (!fileResponse.body) {
        throw new Error(`No data received for ${fileName}`);
      }

      // Stream the file to disk with progress tracking
      const fileStream = fs.createWriteStream(filePath);
      const reader = fileResponse.body.getReader();
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        receivedLength += value.length;
        downloadedSize += value.length;
        fileStream.write(value);

        // Update progress
        const totalProgress = Math.round((downloadedSize / totalSize) * 100);
        const fileProgress = Math.round((receivedLength / file.size) * 100);
        
        sendProgress({
          type: "progress",
          data: {
            message: "Downloading file...",
            fileName,
            fileNumber: index + 1,
            totalFiles: files.length,
            fileProgress,
            totalProgress
          }
        });
      }

      fileStream.end();
      console.log(`Successfully downloaded ${fileName}`);
    }

    sendProgress({
      type: "progress",
      data: {
        message: "Download completed successfully",
        totalProgress: 100
      }
    });

    currentDownloadController = null;
    return payload;
  } catch (error) {
    console.error("Error downloading model:", error);
    // Clean up partially downloaded files on error
    if (fs.existsSync(payload.dirPath)) {
      fs.rmSync(payload.dirPath, { recursive: true, force: true });
    }
    throw error;
  }
}

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

  ipcMainDatabaseHandle("downloadModel", async (payload) => {
    try {
      console.log("downloadModel", payload);
      const result = await downloadModel(payload);
      console.log("result", result);
      return result;
    } catch (error) {
      console.error("Error downloading model:", error);
      throw error;
    }
  });

  ipcMainDatabaseHandle("cancelDownload", async () => {
    if (currentDownloadController) {
      currentDownloadController.abort();
      currentDownloadController = null;
      return { success: true };
    }
    return { success: false };
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
