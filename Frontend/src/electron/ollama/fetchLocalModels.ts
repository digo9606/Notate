import { ipcMain } from 'electron';
import { platform } from 'os';
import log from 'electron-log';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);
const getOllamaPath = () => platform() === "darwin" ? "/usr/local/bin/ollama" : "ollama";

export async function fetchOllamaModels(): Promise<{ models: string[] }> {
  log.info("Fetching Ollama models...");
  try {
    const ollamaPath = getOllamaPath();
    const { stdout } = await exec(`${ollamaPath} list`);
    
    const models = stdout
      .split("\n")
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => line.split(/\s+/)[0]);

    return { models };
  } catch (error) {
    log.error("Failed to fetch Ollama models:", error);
    // If the direct path fails on macOS, try PATH lookup as fallback
    if (platform() === "darwin") {
      try {
        const { stdout } = await exec("ollama list");
        const models = stdout
          .split("\n")
          .slice(1)
          .filter((line) => line.trim())
          .map((line) => line.split(/\s+/)[0]);
        
        log.info(`Fetched models: ${models}`);
        return { models };
      } catch (fallbackError) {
        log.error("Error executing ollama list:", fallbackError);
        return { models: [] };
      }
    }
    return { models: [] };
  }
}

// Register IPC handler in main process
export function setupOllamaModelHandlers() {
  ipcMain.handle('fetchOllamaModels', async () => {
    return await fetchOllamaModels();
  });
}
