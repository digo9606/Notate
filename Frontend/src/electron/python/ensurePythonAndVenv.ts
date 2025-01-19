import { dialog, shell } from "electron";
import { execSync } from "child_process";
import path from "path";
import log from "electron-log";
import { runWithPrivileges } from "./runWithPrivileges.js";
import fs from "fs";
import { getLinuxPackageManager } from "./getLinuxPackageManager.js";
import { updateLoadingStatus } from "../loadingWindow.js";
import { installDependencies } from "./installDependencies.js";
import { ifFedora } from "./ifFedora.js";

export async function ensurePythonAndVenv(backendPath: string) {
  updateLoadingStatus("Installing Python and Virtual Environment...", 0.5);
  const venvPath = path.join(backendPath, "venv");
  const pythonCommands =
    process.platform === "win32"
      ? ["python3.10", "py -3.10", "python"]
      : process.platform === "darwin"
      ? ["/opt/homebrew/bin/python3.10", "python3.10", "python3"]
      : ["python3.10", "python3"];

  let pythonCommand: string | null = null;
  let pythonVersion: string | null = null;

  // First ensure Python is installed
  for (const cmd of pythonCommands) {
    try {
      log.info(`Trying Python command: ${cmd}`);
      updateLoadingStatus(`Trying Python command: ${cmd}`, 1.5);
      const version = execSync(`${cmd} --version`).toString().trim();
      log.info(`Version output: ${version}`);
      updateLoadingStatus(`Version output: ${version}`, 2.0);
      if (version.includes("3.10")) {
        pythonCommand = cmd;
        pythonVersion = version;
        log.info(`Found valid Python command: ${cmd} with version ${version}`);
        updateLoadingStatus(
          `Found valid Python command: ${cmd} with version ${version}`,
          4.5
        );
        break;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        log.info(`Failed to execute ${cmd}: ${error.message}`);
        updateLoadingStatus(`Failed to execute ${cmd}: ${error.message}`, 3.5);
      }
      continue;
    }
  }

  if (!pythonCommand) {
    log.error("Python 3.10 is not installed or not in PATH");
    updateLoadingStatus("Python 3.10 is not installed or not in PATH", 3.5);
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
      updateLoadingStatus("Opening Python download page...", 4.5);
      await shell.openExternal(
        "https://www.python.org/downloads/release/python-31010/"
      );
      updateLoadingStatus(
        "Please restart the application after installing Python 3.10",
        8.5
      );
      throw new Error(
        "Please restart the application after installing Python 3.10"
      );
    } else {
      updateLoadingStatus("Installation cancelled", 4.5);
      throw new Error(
        "Python 3.10 is required to run this application. Installation was cancelled."
      );
    }
  }

  log.info(`Using ${pythonVersion}`);
  updateLoadingStatus(`Using ${pythonVersion}`, 5.5);
  const venvPython =
    process.platform === "win32"
      ? path.join(venvPath, "Scripts", "python.exe")
      : path.join(venvPath, "bin", "python");

  // Create virtual environment if it doesn't exist
  if (!fs.existsSync(venvPath)) {
    log.info("Creating virtual environment with Python 3.10...");
    updateLoadingStatus(
      "Creating virtual environment with Python 3.10...",
      10.5
    );
    if (process.platform === "linux") {
      try {
        const packageManager = getLinuxPackageManager();
        log.info(`Using package manager: ${packageManager.command}`);
        updateLoadingStatus(
          `Using package manager: ${packageManager.command}`,
          11.5
        );
        const pythonFullPath = execSync(`which ${pythonCommand}`)
          .toString()
          .trim();
        log.info(`Full Python path: ${pythonFullPath}`);
        updateLoadingStatus(`Full Python path: ${pythonFullPath}`, 6.5);
        await runWithPrivileges([
          packageManager.installCommand,
          `${pythonFullPath} -m venv "${venvPath}"`,
          `chown -R ${process.env.USER}:${process.env.USER} "${venvPath}"`,
        ]);
        updateLoadingStatus("Virtual environment created successfully", 6.5);
        log.info("Virtual environment created successfully");
      } catch (error: unknown) {
        if (error instanceof Error) {
          log.error("Failed to create virtual environment", error);
          updateLoadingStatus("Failed to create virtual environment", 7.5);
          throw error;
        }
        updateLoadingStatus(
          "Unknown error while creating virtual environment",
          15.5
        );
        throw new Error("Unknown error while creating virtual environment");
      }
    } else {
      try {
        execSync(`${pythonCommand} -m venv "${venvPath}"`);
        log.info("Virtual environment created successfully");
        updateLoadingStatus("Virtual environment created successfully", 7.5);
      } catch (error: unknown) {
        if (error instanceof Error) {
          log.error("Failed to create virtual environment", error);
          updateLoadingStatus("Failed to create virtual environment", 7.5);
          throw new Error("Failed to create virtual environment");
        } else {
          log.error("Unknown error in ensurePythonAndVenv", error);
          updateLoadingStatus("Unknown error in ensurePythonAndVenv", 7.5);
          throw new Error("Unknown error in ensurePythonAndVenv");
        }
      }
    }
  }

  // Check for NVIDIA GPU and CUDA first
  let hasNvidiaGpu = false;
  let cudaAvailable = false;
  
  // Force CPU-only mode for laptops and non-NVIDIA systems
  if (process.platform === "darwin") {
    hasNvidiaGpu = false;
    cudaAvailable = false;
    log.info("MacOS detected, using CPU-only mode");
    updateLoadingStatus("Using CPU-only mode for MacOS", 7.5);
  } else {
    try {
      if (process.platform === "linux" || process.platform === "win32") {
        updateLoadingStatus("Checking for NVIDIA GPU...", 8.5);
        const gpuInfo = execSync("nvidia-smi").toString();
        // Only enable CUDA if this is a dedicated GPU (not a laptop integrated GPU)
        if (!gpuInfo.toLowerCase().includes("notebook") && !gpuInfo.toLowerCase().includes("laptop")) {
          hasNvidiaGpu = true;
          updateLoadingStatus("Dedicated NVIDIA GPU detected", 9.5);
        } else {
          log.info("Laptop GPU detected, using CPU-only mode");
          updateLoadingStatus("Using CPU-only mode for laptop GPU", 9.5);
          hasNvidiaGpu = false;
        }
      }
    } catch {
      log.info("No NVIDIA GPU detected or nvidia-smi not available, using CPU-only mode");
      updateLoadingStatus("Using CPU-only mode", 9.5);
      hasNvidiaGpu = false;
    }
  }

  // Skip CUDA checks if we're in CPU-only mode
  if (hasNvidiaGpu) {
    try {
      updateLoadingStatus("Checking for CUDA installation...", 10.5);
      const cudaCheckCommands = [
        "nvcc --version",
        process.platform === "win32"
          ? "where cuda-install-samples-*.exe"
          : "which nvcc",
        process.platform === "win32"
          ? 'dir /b "%CUDA_PATH%\\bin\\nvcc.exe"'
          : "ls -l /usr/local/cuda/bin/nvcc",
      ];

      for (const cmd of cudaCheckCommands) {
        try {
          const output = execSync(cmd).toString();
          if (output) {
            cudaAvailable = true;
            break;
          }
        } catch (e) {
          log.debug(
            `CUDA check command failed: ${
              e instanceof Error ? e.message : String(e)
            }`
          );
          continue;
        }
      }

      // If CUDA is not available on Linux, try to install it
      if (!cudaAvailable && process.platform === "linux") {
        log.info(
          "CUDA not found on Linux, attempting to install CUDA toolkit..."
        );
        const packageManager = getLinuxPackageManager();

        // Check if we're on Fedora - if so, handle CUDA installation in ifFedora.ts
        if (fs.existsSync("/etc/fedora-release")) {
          await ifFedora();
          // Re-check CUDA availability after Fedora-specific installation
          try {
            const nvccVersion = execSync("nvcc --version").toString();
            if (nvccVersion) {
              log.info("CUDA toolkit installed successfully via Fedora-specific process");
              cudaAvailable = true;
            }
          } catch (error) {
            log.error("Failed to verify CUDA installation on Fedora:", error);
          }
        } else {
          // Non-Fedora Linux systems
          try {
            await runWithPrivileges([
              // Update package list
              `${packageManager.command} update`,
              // Install CUDA toolkit and development tools
              `${packageManager.installCommand} nvidia-cuda-toolkit build-essential`,
            ]);

            // Verify installation
            const nvccVersion = execSync("nvcc --version").toString();
            if (nvccVersion) {
              log.info("CUDA toolkit installed successfully");
              cudaAvailable = true;
            }
          } catch (error) {
            log.error("Failed to install CUDA toolkit:", error);
            // Continue without CUDA support
          }
        }
      }
    } catch (error) {
      log.info("Failed to detect CUDA installation details", error);
    }
  } else {
    cudaAvailable = false;
  }

  // When you reach the dependency installation part, call the new async function:
  return await installDependencies(venvPython, hasNvidiaGpu, cudaAvailable);
}
