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

  // First ensure Python is installed
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

  // Create virtual environment if it doesn't exist
  if (!fs.existsSync(venvPath)) {
    log.info("Creating virtual environment with Python 3.10...");

    if (process.platform === "linux") {
      try {
        const packageManager = getLinuxPackageManager();
        log.info(`Using package manager: ${packageManager.command}`);

        const pythonFullPath = execSync(`which ${pythonCommand}`)
          .toString()
          .trim();
        log.info(`Full Python path: ${pythonFullPath}`);

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

  // Check for NVIDIA GPU and CUDA first
  let hasNvidiaGpu = false;
  let cudaAvailable = false;
  try {
    if (process.platform === "linux" || process.platform === "win32") {
      execSync("nvidia-smi");
      hasNvidiaGpu = true;
    } else if (process.platform === "darwin") {
      hasNvidiaGpu = false;
    }
  } catch {
    log.info("No NVIDIA GPU detected, will use CPU-only packages");
    hasNvidiaGpu = false;
  }

  if (hasNvidiaGpu) {
    try {
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
            break;
          }
        } catch (e) {
          log.debug(`CUDA check command failed: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
      }

      // If CUDA is not available on Linux, try to install it
      if (!cudaAvailable && process.platform === "linux") {
        log.info("CUDA not found on Linux, attempting to install CUDA toolkit...");
        const packageManager = getLinuxPackageManager();
        
        try {
          await runWithPrivileges([
            // Update package list
            `${packageManager.command} update`,
            // Install CUDA toolkit and development tools
            `${packageManager.installCommand} nvidia-cuda-toolkit build-essential`
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
    } catch (error) {
      log.info("Failed to detect CUDA installation details", error);
    }
  }

  // Upgrade pip and install dependencies
  try {
    execSync(`"${venvPython}" -m pip install --upgrade pip`);
    log.info("Pip upgraded successfully");

    // Install NumPy first with specific version and prevent upgrades
    execSync(`"${venvPython}" -m pip install "numpy==1.24.3" --no-deps --no-cache-dir`);
    log.info("NumPy 1.24.3 installed successfully");

    // Install FastAPI and dependencies with version constraints to prevent NumPy upgrade
    const fastApiCommand = process.platform === "darwin" 
      ? `"${venvPython}" -m pip install --no-cache-dir "fastapi==0.115.6" "pydantic>=2.9.0,<3.0.0"  "uvicorn[standard]==0.27.0" "python-multipart==0.0.7" "email-validator==2.1.0" "httpx>=0.26.0,<0.28.0" "numpy==1.24.3" "PyJWT==2.10.1"`
      : `"${venvPython}" -m pip install --no-cache-dir "fastapi>=0.115.6" "pydantic>=2.5.0" "uvicorn[standard]>=0.27.0" "python-multipart>=0.0.7" "email-validator>=2.1.0" "httpx>=0.26.0,<0.28.0" "numpy==1.24.3" "PyJWT==2.10.1"`;
    execSync(fastApiCommand);
    log.info("FastAPI and dependencies installed successfully");

    // Install PyTorch with appropriate CUDA support
    try {
      if (hasNvidiaGpu && cudaAvailable) {
        log.info("Installing PyTorch with CUDA support");
        execSync(`"${venvPython}" -m pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121`);
      } else {
        log.info("Installing CPU-only PyTorch");
        execSync(`"${venvPython}" -m pip install --no-cache-dir torch torchvision torchaudio`);
      }
      log.info("PyTorch installed successfully");
    } catch (error) {
      log.error("Failed to install PyTorch", error);
      throw new Error("Failed to install PyTorch");
    }

    // Check if llama-cpp-python is already installed with correct configuration
    try {
      // Skip llama-cpp-python installation for non-Mac CPU systems
      if (process.platform !== "darwin" && !hasNvidiaGpu) {
        log.info("Skipping llama-cpp-python installation for non-Mac CPU system");
        return { venvPython, hasNvidiaGpu };
      }

      // First install build dependencies for all platforms
      log.info("Installing build dependencies for llama-cpp-python");
      execSync(`"${venvPython}" -m pip install setuptools wheel scikit-build-core cmake ninja`);
      // Install required dependencies first
      execSync(`"${venvPython}" -m pip install typing-extensions numpy diskcache msgpack`);

      if (hasNvidiaGpu && cudaAvailable) {
        // First check for tensor cores capability
        let hasTensorCores = false;
        try {
          const gpuInfo = execSync('nvidia-smi --query-gpu=gpu_name --format=csv,noheader').toString().toLowerCase();
          hasTensorCores = gpuInfo.includes('rtx') || gpuInfo.includes('titan') || gpuInfo.includes('a100') || gpuInfo.includes('a6000');
          log.info(`GPU supports tensor cores: ${hasTensorCores}`);
        } catch (error) {
          log.info('Could not determine tensor cores capability:', error);
        }

        // Set environment variables for CUDA build
        process.env.CMAKE_ARGS = "-DGGML_CUDA=ON";
        process.env.FORCE_CMAKE = "1";
        process.env.LLAMA_CUDA = "1";
        
        // For Fedora Linux, we need to setup CUDA in a toolbox container
        if (process.platform === "linux") {
          try {
            const packageManager = getLinuxPackageManager();
            if (packageManager.command === "dnf") {
              log.info("Fedora system detected, setting up CUDA in toolbox...");
              
              // Create and setup Fedora 39 toolbox for CUDA
              const toolboxSetupCommands = [];

              // Check if container exists
              try {
                execSync("toolbox list | grep fedora-toolbox-39-cuda", { stdio: 'pipe' });
                log.info("Toolbox container already exists, skipping creation");
              } catch {
                // Container doesn't exist, add creation command
                log.info("Creating new toolbox container");
                toolboxSetupCommands.push(
                  "toolbox create --assumeyes --image registry.fedoraproject.org/fedora-toolbox:39 --container fedora-toolbox-39-cuda"
                );
              }

              // Add setup commands
              toolboxSetupCommands.push(
                `toolbox run --container fedora-toolbox-39-cuda bash -c "
                  set -e
                  sudo dnf distro-sync -y
                  sudo dnf install -y @c-development @development-tools cmake
                  sudo dnf config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/fedora39/x86_64/cuda-fedora39.repo
                  sudo dnf distro-sync -y
                  sudo dnf download --arch x86_64 nvidia-driver-libs egl-gbm egl-wayland
                  sudo rpm --install --verbose --hash --excludepath=/usr/lib64/libnvidia-egl-gbm.so.1.1.2 --excludepath=/usr/share/egl/egl_external_platform.d/15_nvidia_gbm.json egl-gbm*.rpm
                  sudo rpm --install --verbose --hash --excludepath=/usr/share/egl/egl_external_platform.d/10_nvidia_wayland.json egl-wayland*.rpm
                  sudo rpm --install --verbose --hash --excludepath=/usr/share/glvnd/egl_vendor.d/10_nvidia.json --excludepath=/usr/share/nvidia/nvoptix.bin nvidia-driver-libs*.rpm
                  sudo dnf install -y cuda
                  echo 'export PATH=$PATH:/usr/local/cuda/bin' | sudo tee /etc/profile.d/cuda.sh
                  sudo chmod +x /etc/profile.d/cuda.sh
                  source /etc/profile.d/cuda.sh
                  nvcc --version
                "`
              );

              for (const cmd of toolboxSetupCommands) {
                try {
                  execSync(cmd, { stdio: 'inherit' });
                } catch (error) {
                  log.error(`Failed to execute command: ${cmd}`, error);
                  throw error;
                }
              }

              // Verify CUDA installation in toolbox
              const nvccVersion = execSync("toolbox run --container fedora-toolbox-39-cuda nvcc --version").toString();
              if (nvccVersion) {
                log.info("CUDA toolkit installed successfully in Fedora toolbox");
                process.env.CUDA_PATH = "/var/lib/toolbox/fedora-toolbox-39-cuda/usr/local/cuda";
                cudaAvailable = true;
              }

              // Install llama-cpp-python with CUDA in toolbox
              log.info("Installing llama-cpp-python with CUDA support in toolbox");
              execSync(`toolbox run --container fedora-toolbox-39-cuda "${venvPython}" -m pip install --no-cache-dir --verbose llama-cpp-python`);
              return { venvPython, hasNvidiaGpu };
            }
          } catch (error) {
            log.error("Failed to setup CUDA toolkit in Fedora toolbox:", error);
            cudaAvailable = false;
          }
        } else if (process.platform === "win32") {
          process.env.CUDA_PATH = process.env.CUDA_PATH || "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.1";
        }
        
        // Additional CUDA optimization environment variables
        process.env.GGML_CUDA_FORCE_MMQ = "1"; // Force MMQ kernels for lower VRAM usage
        process.env.GGML_CUDA_F16 = "1"; // Enable half-precision for better performance
        process.env.GGML_CUDA_ENABLE_UNIFIED_MEMORY = "1"; // Enable unified memory on Linux
        
        log.info("Installing llama-cpp-python with CUDA support");
        execSync(`"${venvPython}" -m pip install --no-cache-dir --verbose llama-cpp-python`);
        
        // Verify CUDA installation
        const checkCuda = `"${venvPython}" -c "from llama_cpp import Llama; import inspect; print('n_gpu_layers' in inspect.signature(Llama.__init__).parameters)"`;
        const result = execSync(checkCuda).toString().trim();
        
        if (result.toLowerCase() !== 'true') {
          throw new Error('CUDA support not properly enabled');
        }
        
        log.info("Successfully installed CUDA-enabled llama-cpp-python");
      } else {
        log.info("Installing CPU-only llama-cpp-python");
        // For Windows, we need to ensure we have a C++ compiler
        if (process.platform === "win32") {
          try {
            execSync("cl.exe");
          } catch (error: unknown) {
            log.error("Microsoft Visual C++ compiler not found:", error instanceof Error ? error.message : String(error));
            log.info("Installing llama-cpp-python from wheel instead");
            execSync(`"${venvPython}" -m pip install --no-cache-dir --only-binary :all: llama-cpp-python`);
            log.info("Successfully installed llama-cpp-python from wheel");
            return { venvPython, hasNvidiaGpu };
          }
        }
        execSync(`"${venvPython}" -m pip install --no-cache-dir llama-cpp-python`);
      }
    } catch (e) {
      log.error("Failed to install llama-cpp-python", e);
      throw new Error("Failed to install llama-cpp-python");
    }

    // Set environment variables for runtime
    process.env.USE_CUDA = hasNvidiaGpu && cudaAvailable ? "1" : "0";
    process.env.LLAMA_CUDA_FORCE_MMQ = "1";
    process.env.GGML_CUDA_NO_PINNED = "1";
    process.env.GGML_CUDA_FORCE_MMQ = "1";

    return { venvPython, hasNvidiaGpu };

  } catch (error) {
    log.error("Failed to upgrade pip or install dependencies", error);
    throw new Error("Failed to upgrade pip or install dependencies");
  }
}
