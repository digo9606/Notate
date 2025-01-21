import { spawnAsync } from "../helpers/spawnAsync.js";
import log from "electron-log";
import { ifFedora } from "./ifFedora.js";
import { dialog, shell } from "electron";
import { updateLoadingStatus } from "../loadingWindow.js";

const cudaLoadingMessages = [
  "Herding CUDA llamas into the pen...",
  "Teaching llamas quantum physics...",
  "Boy, these CUDA llamas take forever to train...",
  "Convincing llamas that parallel processing is fun...",
  "Feeding llamas their favorite CUDA treats...",
  "Still working... llamas are notoriously stubborn...",
  "Optimizing llama performance (they're a bit lazy)...",
  "Running llama benchmarks (they're on a coffee break)...",
  "Almost there! Just waking up some sleepy llamas...",
  "Turns out llamas need a lot of CUDA cores...",
];

let messageIndex = 0;
let messageInterval: NodeJS.Timeout | null = null;

function startRotatingMessages(baseProgress: number) {
  messageIndex = 0;
  if (messageInterval) clearInterval(messageInterval);

  messageInterval = setInterval(() => {
    updateLoadingStatus(
      "Installing CUDA llama-cpp-python (this may take a while) " +
        cudaLoadingMessages[messageIndex],
      baseProgress
    );
    messageIndex = (messageIndex + 1) % cudaLoadingMessages.length;
  }, 15000); // Rotate message every 15 seconds
}

function stopRotatingMessages() {
  if (messageInterval) {
    clearInterval(messageInterval);
    messageInterval = null;
  }
}

export async function installLlamaCpp(
  venvPython: string,
  hasNvidiaGpu: boolean,
  cudaAvailable: boolean
) {
  try {
    if (hasNvidiaGpu && cudaAvailable) {
      // Install build dependencies for CUDA
      updateLoadingStatus("Installing build dependencies for CUDA", 22.5);
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
      updateLoadingStatus(
        "Installing typing-extensions, numpy, diskcache, msgpack",
        23.5
      );
      await spawnAsync(venvPython, [
        "-m",
        "pip",
        "install",
        "typing-extensions",
        "numpy",
        "diskcache",
        "msgpack",
      ]);

      // Check for Fedora and install CUDA toolkit if needed
      await ifFedora();
      updateLoadingStatus("Installing CUDA toolkit for Fedora", 24.5);
      process.env.CMAKE_ARGS = "-DGGML_CUDA=ON";
      process.env.FORCE_CMAKE = "1";
      process.env.LLAMA_CUDA = "1";
      process.env.GGML_CUDA_FORCE_MMQ = "1";
      process.env.GGML_CUDA_F16 = "1";
      process.env.GGML_CUDA_ENABLE_UNIFIED_MEMORY = "1";

      log.info("Installing llama-cpp-python with CUDA support");
      updateLoadingStatus(
        "Installing llama-cpp-python with CUDA support (this may take a while)",
        25.5
      );
      try {
        startRotatingMessages(25.5);
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
              NVCC_PREPEND_FLAGS: "-ccbin /usr/bin/g++-13",
            },
          }
        );
        stopRotatingMessages();
        updateLoadingStatus("llama-cpp-python installed successfully", 30.5);
      } catch (error) {
        if (process.platform === "win32") {
          log.error(
            "Failed to install llama-cpp-python with CUDA support",
            error
          );
          updateLoadingStatus(
            "Failed to install llama-cpp-python with CUDA support. Asking user to install CPU version.",
            30.5
          );
          const { response } = await dialog.showMessageBox({
            type: "error",
            title: "CUDA Installation Error",
            message:
              "Failed to install llama-cpp-python with CUDA support. Would you like to proceed with CPU-only version instead?",
            detail:
              "This could be due to missing Visual Studio 2022 with C++ Desktop Development Tools. Would you like to proceed with CPU-only version instead?\n\nNote: You can install Visual Studio and try CUDA installation again later.",
            buttons: [
              "Install CPU Version",
              "Open Visual Studio Download Page",
            ],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          });
          if (response === 0) {
            log.info(
              "Falling back to CPU-only installation using pre-built wheel"
            );
            updateLoadingStatus(
              "Falling back to CPU-only installation using pre-built wheel",
              31.5
            );
            await spawnAsync(venvPython, [
              "-m",
              "pip",
              "install",
              "--only-binary",
              ":all:",
              "llama-cpp-python",
              "--extra-index-url",
              "https://abetlen.github.io/llama-cpp-python/whl/cpu",
              "--no-cache-dir",
              "--verbose",
            ]);
            updateLoadingStatus("CPU-only installation completed", 32.5);
          } else {
            // Open Visual Studio download page
            await shell.openExternal(
              "https://visualstudio.microsoft.com/vs/community/"
            );
            throw error;
          }
        } else {
          throw error;
        }
      }
    } else {
      // CPU-only installation
      updateLoadingStatus("Installing CPU-only llama-cpp-python", 26.5);
      log.info("Installing CPU-only llama-cpp-python");
      try {
        if (process.platform === "darwin") {
          // On macOS, build from source
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
          updateLoadingStatus(
            "Installing CPU-only llama-cpp-python (this may take a while)",
            27.5
          );
          await spawnAsync(venvPython, [
            "-m",
            "pip",
            "install",
            "--verbose",
            "--no-cache-dir",
            "llama-cpp-python",
          ]);
          updateLoadingStatus("CPU-only installation completed", 28.5);
        } else {
          // For other platforms, try pre-built wheel first
          await spawnAsync(venvPython, [
            "-m",
            "pip",
            "install",
            "--only-binary",
            ":all:",
            "llama-cpp-python",
            "--extra-index-url",
            "https://abetlen.github.io/llama-cpp-python/whl/cpu",
            "--no-cache-dir",
            "--verbose",
          ]);
          updateLoadingStatus("CPU-only installation completed", 28.5);
        }
      } catch (error) {
        if (process.platform === "win32") {
          log.error("Failed to install llama-cpp-python", error);
          await dialog.showMessageBox({
            type: "error",
            title: "Installation Error",
            message: "Failed to install llama-cpp-python",
            detail:
              "An error occurred while installing the CPU version of llama-cpp-python. Please try again or check your internet connection.",
            buttons: ["OK"],
          });
        }
        throw error;
      }
    }
  } catch (error) {
    log.error("Error during llama-cpp-python installation:", error);
    throw error;
  }
}
