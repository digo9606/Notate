import { dialog, shell, app } from "electron";
import { execSync } from "child_process";
import path from "path";
import log from "electron-log";
import { runWithPrivileges } from "./runWithPrivileges.js";
import fs from "fs";

function removeVenvDirectory(venvPath: string) {
  try {
    if (fs.existsSync(venvPath)) {
      if (process.platform === "win32") {
        execSync(`rmdir /s /q "${venvPath}"`);
      } else {
        execSync(`rm -rf "${venvPath}"`);
      }
      log.info("Successfully removed existing venv directory");
    }
  } catch (error) {
    log.error("Failed to remove venv directory", error);
    throw new Error("Failed to remove existing venv directory");
  }
}

export async function ensurePythonAndVenv(backendPath: string) {
    // Ensure we're using the correct path in production
    const resolvedBackendPath = app.isPackaged 
        ? path.join(process.resourcesPath, "backend")
        : backendPath;
    
    const venvPath = path.join(resolvedBackendPath, "venv");
    log.info(`Backend path: ${resolvedBackendPath}`);
    log.info(`Venv path: ${venvPath}`);

    const pythonCommands =
      process.platform === "win32"
        ? ["python3.10", "py -3.10", "python"]
        : process.platform === "darwin"
        ? ["/opt/homebrew/bin/python3.10", "python3.10", "python3"]
        : ["python3.10", "python3"];
  
    let pythonCommand: string | null = null;
    let pythonVersion: string | null = null;
  /* [2025-01-08 20:33:12.049] [error] Failed to upgrade pip Error: Command failed: "C:\Users\texas\AppData\Local\Programs\notate\resources\Backend\venv\Scripts\python.exe" -m pip install --upgrade pip
No Python at '"C:\Program Files\Python310\python.exe' */
    for (const cmd of pythonCommands) {
      try {
        log.info(`Trying Python command: ${cmd}`);
        const version = execSync(`${cmd} --version`).toString().trim();
        log.info(`Version output: ${version}`);
        if (version.includes("3.10")) {
          pythonCommand = cmd;
          pythonVersion = version;
          log.info(`Found valid Python command: ${cmd} with version ${version}`);
          break;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          log.info(`Failed to execute ${cmd}: ${error.message}`);
        }
        continue;
      }
    }
  
    if (!pythonCommand) {
      log.error("Python 3.10 is not installed or not in PATH");
      const response = await dialog.showMessageBox({
        type: "question",
        buttons: ["Install Python 3.10", "Cancel"],
        defaultId: 0,
        title: "Python 3.10 Required",
        message: "Python 3.10 is required but not found on your system.",
        detail:
          "Would you like to open the Python download page to install Python 3.10?",
      });
  
      if (response.response === 0) {
        // Open Python download page
        await shell.openExternal(
          "https://www.python.org/downloads/release/python-31010/"
        );
        throw new Error(
          "Please restart the application after installing Python 3.10"
        );
      } else {
        throw new Error(
          "Python 3.10 is required to run this application. Installation was cancelled."
        );
      }
    }
  
    log.info(`Using ${pythonVersion}`);
  
    log.info(`Virtual environment path: ${venvPath}`);

    const venvPython = path.join(
      venvPath,
      process.platform === "win32" ? "Scripts" : "bin",
      process.platform === "win32" ? "python.exe" : "python"
    );
    log.info(`Virtual environment Python path: ${venvPython}`);

    if (!fs.existsSync(venvPath)) {
      log.info("Creating virtual environment with Python 3.10...");
      log.info(`Using Python command: ${pythonCommand}`);
      log.info(`Creating venv at: ${venvPath}`);
  
      if (process.platform === "linux") {
        try {
          // Run all commands with a single privilege prompt
          await runWithPrivileges([
            "apt-get update && apt-get install -y python3-venv python3-dev build-essential",
            `${pythonCommand} -m venv "${venvPath}"`,
            `chown -R ${process.env.USER}:${process.env.USER} "${venvPath}"`,
          ]);
  
          log.info("Virtual environment created successfully");
        } catch (error: unknown) {
          if (error instanceof Error) {
            log.error("Failed to create virtual environment", error);
            throw error;
          }
          throw new Error("Unknown error while creating virtual environment");
        }
      } else {
        // Original code for non-Linux systems
        try {
          const createVenvCommand = `${pythonCommand} -m venv "${venvPath}"`;
          log.info(`Running command: ${createVenvCommand}`);
          execSync(createVenvCommand);
          log.info("Virtual environment created successfully");
        } catch (error: unknown) {
          if (error instanceof Error) {
            log.error("Failed to create virtual environment", error);
            log.error(`Command output: ${error.message}`);
            throw new Error(`Failed to create virtual environment: ${error.message}`);
          } else {
            log.error("Unknown error in ensurePythonAndVenv", error);
            throw new Error("Unknown error in ensurePythonAndVenv");
          }
        }
      }
    }
  
    // Try to upgrade pip, with one retry attempt if it fails
    let retryAttempt = false;
    while (true) {
      try {
        execSync(`"${venvPython}" -m pip install --upgrade pip`);
        log.info("Pip upgraded successfully");
        break;
      } catch (error) {
        if (!retryAttempt) {
          log.info("Failed to upgrade pip, attempting to recreate venv...");
          removeVenvDirectory(venvPath);
          if (process.platform === "linux") {
            await runWithPrivileges([
              `${pythonCommand} -m venv "${venvPath}"`,
              `chown -R ${process.env.USER}:${process.env.USER} "${venvPath}"`,
            ]);
          } else {
            execSync(`${pythonCommand} -m venv "${venvPath}"`);
          }
          retryAttempt = true;
          continue;
        }
        log.error("Failed to upgrade pip after retry", error);
        throw new Error("Failed to upgrade pip after retry");
      }
    }
  
    // Add check for NVIDIA GPU
    let hasNvidiaGpu = false;
    try {
      if (process.platform === "linux") {
        execSync("nvidia-smi");
        hasNvidiaGpu = true;
      } else if (process.platform === "win32") {
        execSync("nvidia-smi");
        hasNvidiaGpu = true;
      } else if (process.platform === "darwin") {
        // MacOS doesn't support CUDA
        hasNvidiaGpu = false;
      }
    } catch {
      log.info("No NVIDIA GPU detected, will use CPU-only packages");
      hasNvidiaGpu = false;
    }
  
    // Set environment variable for the Python process
    process.env.USE_CUDA = hasNvidiaGpu ? "1" : "0";
  
    return { venvPython, hasNvidiaGpu };
  }
  