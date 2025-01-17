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

        // Install RPM Fusion repositories
        const match = fs
          .readFileSync("/etc/fedora-release", "utf8")
          .match(/\d+/);
        if (!match) throw new Error("Could not determine Fedora version");
        const fedoraVersion = match[0];
        execSync(
          `sudo dnf install -y https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-${fedoraVersion}.noarch.rpm https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${fedoraVersion}.noarch.rpm`
        );

        // Install NVIDIA drivers and CUDA support
        execSync("sudo dnf install -y akmod-nvidia xorg-x11-drv-nvidia-cuda");

        // Install GCC 13 for CUDA compatibility
        execSync("sudo dnf install -y gcc13-c++");

        // Download and install CUDA toolkit
        const cudaInstaller = "cuda_12.6.2_560.35.03_linux.run";
        if (!fs.existsSync(cudaInstaller)) {
          execSync(
            `wget https://developer.download.nvidia.com/compute/cuda/12.6.2/local_installers/${cudaInstaller}`
          );
        }

        // Run CUDA installer with toolkit-only options
        execSync(
          `sudo sh ${cudaInstaller} --toolkit --toolkitpath=/usr/local/cuda-12.6 --no-man-page --no-desktop-menu`
        );

        // Setup symlinks and environment
        execSync(`
          cd /usr/local && \
          sudo rm -f cuda && \
          sudo ln -s cuda-12.6 cuda && \
          sudo ln -s cuda/bin bin && \
          sudo ln -s cuda/lib64 lib64 && \
          sudo ln -s cuda-12.6/nvvm nvvm
        `);

        // Configure library paths
        execSync(
          'sudo sh -c "echo "/usr/local/lib64" > /etc/ld.so.conf.d/usr-local-x86_64.conf"'
        );
        execSync("sudo ldconfig -v");

        // Set NVCC to use GCC 13
        process.env.NVCC_PREPEND_FLAGS = "-ccbin /usr/bin/g++-13";
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
          NVCC_PREPEND_FLAGS: "-ccbin /usr/bin/g++-13", // Ensure GCC 13 is used for CUDA compilation
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
