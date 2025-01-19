import { spawnAsync } from "../helpers/spawnAsync.js";
import log from "electron-log";
import { updateLoadingStatus } from "../loadingWindow.js";
import { installLlamaCpp } from "./installLlamaCpp.js";

export async function installDependencies(
  venvPython: string,
  hasNvidiaGpu: boolean,
  cudaAvailable: boolean
) {
  try {
    // Upgrade pip first
    await spawnAsync(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
    log.info("Pip upgraded successfully");
    updateLoadingStatus("Pip upgraded successfully", 36.5);

    // Install NumPy with specific version
    await spawnAsync(venvPython, [
      "-m",
      "pip",
      "install",
      "numpy==1.24.3",
      "--no-deps",
      "--no-cache-dir",
    ]);
    log.info("NumPy 1.24.3 installed successfully");
    updateLoadingStatus("NumPy 1.24.3 installed successfully", 39.5);

    // Install FastAPI and dependencies
    const fastApiDeps =
      process.platform === "darwin"
        ? [
            "fastapi==0.115.6",
            "pydantic>=2.9.0,<3.0.0",
            "uvicorn[standard]==0.27.0",
            "numpy==1.24.3",
            "PyJWT==2.10.1",
          ]
        : [
            "fastapi>=0.115.6",
            "pydantic>=2.5.0",
            "uvicorn[standard]>=0.27.0",
            "numpy==1.24.3",
            "PyJWT==2.10.1",
          ];

    await spawnAsync(venvPython, [
      "-m",
      "pip",
      "install",
      "--no-cache-dir",
      ...fastApiDeps,
    ]);
    log.info("FastAPI and dependencies installed successfully");
    updateLoadingStatus(
      "FastAPI and dependencies installed successfully",
      42.5
    );

    // Install PyTorch
    if (hasNvidiaGpu && cudaAvailable) {
      log.info("Installing PyTorch with CUDA support");
      await spawnAsync(venvPython, [
        "-m",
        "pip",
        "install",
        "--no-cache-dir",
        "torch",
        "torchvision",
        "torchaudio",
        "--index-url",
        "https://download.pytorch.org/whl/cu121",
      ]);
    } else {
      log.info("Installing CPU-only PyTorch");
      await spawnAsync(venvPython, [
        "-m",
        "pip",
        "install",
        "--no-cache-dir",
        "torch",
        "torchvision",
        "torchaudio",
      ]);
    }
    log.info("PyTorch installed successfully");
    updateLoadingStatus("PyTorch installed successfully", 44.5);

    // Install transformers and related packages
    await spawnAsync(venvPython, [
      "-m",
      "pip",
      "install",
      "--no-cache-dir",
      "transformers==4.48.0",
      "sentence-transformers==3.3.1",
    ]);
    log.info("Transformers installed successfully");
    updateLoadingStatus("Transformers installed successfully", 46.5);

    // Install llama-cpp-python if needed
    if (process.platform === "darwin" || hasNvidiaGpu) {
      await installLlamaCpp(venvPython, hasNvidiaGpu, cudaAvailable);
    }

    return { venvPython, hasNvidiaGpu };
  } catch (error) {
    log.error("Failed to install dependencies", error);
    throw error;
  }
}
