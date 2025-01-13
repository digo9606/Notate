import { dialog, shell } from "electron";
import { execSync } from "child_process";
import path from "path";
import log from "electron-log";
import { runWithPrivileges } from "./runWithPrivileges.js";
import fs from "fs";
import { getLinuxPackageManager } from "./getLinuxPackageManager.js";

export async function ensurePythonAndVenv(backendPath: string) {
  const venvPath = path.join(backendPath, "venv");
  const pythonCommands =
    process.platform === "win32"
      ? ["python3.10", "py -3.10", "python"]
      : process.platform === "darwin"
      ? ["/opt/homebrew/bin/python3.10", "python3.10", "python3"]
      : ["python3.10", "python3"];

  let pythonCommand: string | null = null;
  let pythonVersion: string | null = null;

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

  const venvPython =
    process.platform === "win32"
      ? path.join(venvPath, "Scripts", "python.exe")
      : path.join(venvPath, "bin", "python");

  if (!fs.existsSync(venvPath)) {
    log.info("Creating virtual environment with Python 3.10...");

    if (process.platform === "linux") {
      try {
        const packageManager = getLinuxPackageManager();
        log.info(`Using package manager: ${packageManager.command}`);

        // For Linux, ensure we use the full path in privileged commands
        const pythonFullPath = execSync(`which ${pythonCommand}`)
          .toString()
          .trim();
        log.info(`Full Python path: ${pythonFullPath}`);

        // Run all commands with a single privilege prompt
        await runWithPrivileges([
          packageManager.installCommand,
          `${pythonFullPath} -m venv "${venvPath}"`,
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
        execSync(`${pythonCommand} -m venv "${venvPath}"`);
        log.info("Virtual environment created successfully");
      } catch (error: unknown) {
        if (error instanceof Error) {
          log.error("Failed to create virtual environment", error);
          throw new Error("Failed to create virtual environment");
        } else {
          log.error("Unknown error in ensurePythonAndVenv", error);
          throw new Error("Unknown error in ensurePythonAndVenv");
        }
      }
    }
  }

  try {
    execSync(`"${venvPython}" -m pip install --upgrade pip`);
    log.info("Pip upgraded successfully");
  } catch (error) {
    log.error("Failed to upgrade pip", error);
    throw new Error("Failed to upgrade pip");
  }

  // Add check for NVIDIA GPU and CUDA
  let hasNvidiaGpu = false;
  let cudaAvailable = false;
  let cudaVersion: string | null = null;

  // Check for NVIDIA GPU
  try {
    if (process.platform === "linux" || process.platform === "win32") {
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

  // If we have an NVIDIA GPU, check for CUDA in multiple ways
  if (hasNvidiaGpu) {
    try {
      // Try different methods to detect CUDA
      const cudaCheckCommands = [
        "nvcc --version",
        process.platform === "win32" 
          ? "where cuda-install-samples-*.exe"
          : "which nvcc",
        process.platform === "win32"
          ? "dir /b \"%CUDA_PATH%\\bin\\nvcc.exe\""
          : "ls -l /usr/local/cuda/bin/nvcc"
      ];

      for (const cmd of cudaCheckCommands) {
        try {
          const output = execSync(cmd).toString();
          if (output) {
            cudaAvailable = true;
            // Try to extract CUDA version from various outputs
            const versionMatch = output.match(/release (\d+\.\d+)/i) || 
                               output.match(/cuda[/\\]v?(\d+\.\d+)/i) ||
                               output.match(/cuda-(\d+\.\d+)/i);
            if (versionMatch) {
              cudaVersion = versionMatch[1];
              break;
            }
          }
        } catch (e) {
          log.debug(`CUDA check command failed: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
      }
    } catch (error) {
      log.info("Failed to detect CUDA installation details", error);
    }
  }

  // Add CUDA support prompt if NVIDIA GPU is detected
  if (hasNvidiaGpu) {
    let detailMessage = "This will install llama-cpp-python with CUDA support.";
    if (!cudaAvailable) {
      detailMessage += "\n\nNOTE: CUDA toolkit is not detected on your system. " +
        "Please install CUDA toolkit (version 12.1-12.5) from NVIDIA's website first:\n" +
        "https://developer.nvidia.com/cuda-downloads";
    } else if (cudaVersion) {
      detailMessage += `\n\nDetected CUDA version: ${cudaVersion}`;
    }

    const cudaResponse = await dialog.showMessageBox({
      type: "question",
      buttons: cudaAvailable ? ["Yes", "No"] : ["Open CUDA Download Page", "Cancel"],
      defaultId: 0,
      title: "CUDA Support Available",
      message: cudaAvailable 
        ? "Would you like to enable CUDA support for better performance?"
        : "CUDA Toolkit Required",
      detail: detailMessage,
    });

    if (cudaResponse.response === 0) {
      if (!cudaAvailable) {
        // Open NVIDIA CUDA download page
        await shell.openExternal("https://developer.nvidia.com/cuda-downloads");
        throw new Error("Please install CUDA toolkit and restart the application");
      }

      log.info("Installing llama-cpp-python with CUDA support");
      try {
        let command: string;
        
        if (cudaVersion && ["12.1", "12.2", "12.3", "12.4", "12.5"].includes(cudaVersion)) {
          // Use pre-built wheel for supported CUDA versions
          const cudaShortVersion = cudaVersion.replace(".", "");
          command = `"${venvPython}" -m pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu${cudaShortVersion}`;
        } else {
          // Fall back to building from source
          command = `CMAKE_ARGS="-DGGML_CUDA=on" "${venvPython}" -m pip install llama-cpp-python`;
        }
        
        if (process.platform === "linux") {
          await runWithPrivileges([command]);
        } else {
          execSync(command);
        }
        log.info("Successfully installed llama-cpp-python with CUDA support");
      } catch (error) {
        log.error("Failed to install CUDA support", error);
        await dialog.showMessageBox({
          type: "error",
          title: "CUDA Installation Failed",
          message: "Failed to install CUDA support",
          detail: error instanceof Error 
            ? `${error.message}\n\nPlease ensure CUDA toolkit is properly installed and try again.`
            : "Unknown error occurred",
        });
      }
    }
  }

  // Set environment variable for the Python process
  process.env.USE_CUDA = hasNvidiaGpu && cudaAvailable ? "1" : "0";

  return { venvPython, hasNvidiaGpu };
}
