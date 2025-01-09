import { app } from "electron";
import { spawn, ChildProcess, SpawnOptions } from "child_process";
import path from "path";
import { isDev } from "../util.js";
import { updateLoadingStatus } from "../loadingWindow.js";
import fs from "fs";
import log from "electron-log";
import ffmpegStatic from "ffmpeg-static";
import { generateSecret } from "../authentication/secret.js";
import { getSecret } from "../authentication/devApi.js";
import { ensurePythonAndVenv } from "./ensurePythonAndVenv.js";
import { extractFromAsar } from "./extractFromAsar.js";
log.transports.file.level = "info";
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath("userData"), "logs/main.log");

let pythonProcess: ChildProcess | null = null;


export async function startPythonServer() {
  log.info("Application starting...");
  log.info("Creating window...");
  const appPath = app.getAppPath();
  log.info(`App path: ${appPath}`);

  // Generate JWT secret before starting the server
  const jwtSecret = generateSecret();

  let backendPath;
  if (isDev()) {
    // In dev mode, Backend is one level up from the Frontend directory
    backendPath = path.join(appPath, "..", "Backend");
    log.info(`Dev mode: Backend path set to ${backendPath}`);
  } else {
    // In production, Backend should be in the resources directory
    backendPath = path.join(process.resourcesPath, "backend");
    log.info(`Prod mode: Backend path set to ${backendPath}`);

    if (!fs.existsSync(backendPath)) {
      const tempPath = path.join(app.getPath("temp"), "notate-backend");
      log.info(`Prod mode: Temp path set to ${tempPath}`);
      // Use relative path from the app's root
      const asarBackendPath = path.join(appPath, "backend");
      log.info(`Prod mode: ASAR Backend path set to ${asarBackendPath}`);
      try {
        extractFromAsar(asarBackendPath, tempPath);
        log.info(`Successfully extracted from ASAR to ${tempPath}`);
        backendPath = tempPath;
      } catch (error) {
        log.error(`Failed to extract from ASAR: ${error}`);
        throw error;
      }
    }
  }

  // Use path.join for constructing paths to scripts
  const dependencyScript = path.join(backendPath, "ensure_dependencies.py");
  const mainScript = path.join(backendPath, "main.py");
  
  return new Promise((resolve, reject) => {
    let totalPackages = 0;
    let installedPackages = 0;
    ensurePythonAndVenv(backendPath)
      .then(({ venvPython, hasNvidiaGpu }) => {
        log.info(`Venv Python: ${venvPython}`);
        log.info(`CUDA enabled: ${hasNvidiaGpu}`);

        // Define spawn options with proper typing
        const spawnOptions: SpawnOptions = {
          stdio: "pipe",
          env: {
            ...process.env,
            USE_CUDA: hasNvidiaGpu ? "1" : "0",
            FFMPEG_PATH: app.isPackaged
              ? path.join(
                  process.resourcesPath,
                  "ffmpeg" + (process.platform === "win32" ? ".exe" : "")
                )
              : typeof ffmpegStatic === "string"
              ? ffmpegStatic
              : "",
            JWT_SECRET: jwtSecret,
            IS_DEV: isDev() ? "1" : "0",
            SECRET_KEY: getSecret(),
          },
        };

        // Pass the GPU status and FFmpeg path to the dependency script
        const depProcess = spawn(venvPython, [dependencyScript], spawnOptions);

        if (!depProcess.stdout || !depProcess.stderr) {
          throw new Error("Failed to create process with stdio pipes");
        }

        log.info(`Dependency process started: ${depProcess.pid}`);

        depProcess.stdout.on("data", (data: Buffer) => {
          const message = data.toString().trim();
          log.info(`Dependency process output: ${message}`);

          if (message.startsWith("Total packages:")) {
            totalPackages = parseInt(
              message.split("|")[0].split(":")[1].trim()
            );
          } else {
            const [text, progress] = message.split("|");
            if (progress) {
              updateLoadingStatus(text, parseFloat(progress));
            } else {
              updateLoadingStatus(
                text,
                (installedPackages / totalPackages) * 75
              );
            }

            if (text.includes("Installing")) {
              installedPackages++;
            }
          }
        });

        depProcess.stderr.on("data", (data: Buffer) => {
          const errorMessage = data.toString().trim();
          // Don't treat these as errors since they're actually info messages from uvicorn
          if (errorMessage.includes("INFO:")) {
            log.info(`Python info: ${errorMessage}`);
          } else {
            log.error(`Dependency check error: ${errorMessage}`);
            updateLoadingStatus(`Error: ${errorMessage}`, -1);
          }
        });

        depProcess.on("close", (code: number | null) => {
          log.info(`Dependency process closed with code ${code}`);
          if (code === 0) {
            updateLoadingStatus("Starting application server...", 80);

            // Create Python process with same options
            pythonProcess = spawn(venvPython, [mainScript], spawnOptions);

            if (
              !pythonProcess ||
              !pythonProcess.stdout ||
              !pythonProcess.stderr
            ) {
              reject(
                new Error("Failed to create Python process with stdio pipes")
              );
              return;
            }

            log.info(`Python process spawned with PID: ${pythonProcess.pid}`);

            pythonProcess.stdout.on("data", (data: Buffer) => {
              const message = data.toString().trim();
              log.info(`Python stdout: ${message}`);
              if (
                message.includes("Application startup complete.") ||
                message.includes("Uvicorn running on http://127.0.0.1:47372")
              ) {
                updateLoadingStatus("Application server ready!", 100);
                resolve(true);
              }
            });

            pythonProcess.stderr.on("data", (data: Buffer) => {
              const errorMessage = data.toString().trim();
              // Don't treat uvicorn startup messages as errors
              if (errorMessage.includes("INFO")) {
                log.info(`Python info: ${errorMessage}`);
                if (
                  errorMessage.includes("Application startup complete.") ||
                  errorMessage.includes(
                    "Uvicorn running on http://127.0.0.1:47372"
                  )
                ) {
                  updateLoadingStatus("Application server ready!", 100);
                  resolve(true);
                }
              } else {
                log.error(`Python stderr: ${errorMessage}`);
              }
            });

            pythonProcess.on("error", (error: Error) => {
              const errorMessage = `Failed to start Python server: ${error.message}`;
              log.error(errorMessage);
              updateLoadingStatus(errorMessage, -1);
              reject(error);
            });

            pythonProcess.on("close", (code: number | null) => {
              if (code !== 0) {
                const errorMessage = `Python server exited with code ${code}`;
                log.error(errorMessage);
                updateLoadingStatus(errorMessage, -1);
                reject(new Error(errorMessage));
              }
            });
          } else {
            const errorMessage = `Dependency installation failed with code ${code}`;
            log.error(errorMessage);
            updateLoadingStatus(errorMessage, -1);
            reject(new Error(errorMessage));
          }
        });
      })
      .catch((error) => {
        log.error("Failed to start Python server", error);
        reject(error);
      });
  });
}

export function stopPythonServer() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
}
