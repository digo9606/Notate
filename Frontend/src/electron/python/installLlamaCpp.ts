import { spawnAsync } from "../helpers/spawnAsync.js";
import log from "electron-log";
import fs from "fs";
import { execSync } from "child_process";

export async function installLlamaCpp(
  venvPython: string,
  hasNvidiaGpu: boolean,
  cudaAvailable: boolean
) {
  await spawnAsync(venvPython, [
    "-m",
    "pip",
    "install",
    "setuptools",
    "wheel",
    "scikit-build-core",
    "cmake",
    "ninja",
  ]);
  await spawnAsync(venvPython, [
    "-m",
    "pip",
    "install",
    "typing-extensions",
    "numpy",
    "diskcache",
    "msgpack",
  ]);

  if (hasNvidiaGpu && cudaAvailable) {
    // Check for Fedora and install CUDA toolkit if needed
    if (fs.existsSync("/etc/fedora-release")) {
      try {
        log.info("Fedora system detected, checking CUDA toolkit");
        execSync("which nvcc");
        log.info("CUDA toolkit already installed");
      } catch {
        log.info("Installing CUDA toolkit for Fedora");
        execSync("sudo dnf install -y cuda-toolkit-12-config-common cuda-toolkit-12-files cuda-toolkit-12");
      }
    }

    process.env.CMAKE_ARGS = "-DGGML_CUDA=ON";
    process.env.FORCE_CMAKE = "1";
    process.env.LLAMA_CUDA = "1";
    process.env.GGML_CUDA_FORCE_MMQ = "1";
    process.env.GGML_CUDA_F16 = "1";
    process.env.GGML_CUDA_ENABLE_UNIFIED_MEMORY = "1";

    log.info("Installing llama-cpp-python with CUDA support");
    await spawnAsync(
      venvPython,
      [
        "-m",
        "pip",
        "install",
        "--no-cache-dir",
        "--verbose",
        "llama-cpp-python",
      ],
      {
        env: {
          ...process.env,
          FORCE_CMAKE: "1",
          CMAKE_ARGS: "-DGGML_CUDA=ON",
          LLAMA_CUDA: "1",
          VERBOSE: "1",
          CMAKE_BUILD_PARALLEL_LEVEL: "8",
        },
      }
    );
  } else {
    log.info("Installing CPU-only llama-cpp-python");
    await spawnAsync(venvPython, [
      "-m",
      "pip",
      "install",
      "--no-cache-dir",
      "llama-cpp-python",
    ]);
  }
}
