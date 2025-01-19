import { execSync } from "child_process";
import fs from "fs";
import log from "electron-log";
import { runWithPrivileges } from "./runWithPrivileges.js";

export async function ifFedora() {
  if (fs.existsSync("/etc/fedora-release")) {
    try {
      log.info("Fedora system detected, checking CUDA toolkit");
      execSync("which nvcc");
      log.info("CUDA toolkit already installed");
    } catch {
      log.info("Installing CUDA toolkit for Fedora");

      // Check if CUDA is already installed at target location
      if (fs.existsSync("/usr/local/cuda-12.6")) {
        log.info("CUDA 12.6 already installed at /usr/local/cuda-12.6");
      } else {
        // Get Fedora version
        const match = fs
          .readFileSync("/etc/fedora-release", "utf8")
          .match(/\d+/);
        if (!match) throw new Error("Could not determine Fedora version");
        const fedoraVersion = match[0];

        const cudaInstaller = "cuda_12.6.2_560.35.03_linux.run";
        const installScript = `
# Install RPM Fusion repositories
dnf install -y https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-${fedoraVersion}.noarch.rpm https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${fedoraVersion}.noarch.rpm

# Install NVIDIA drivers, CUDA support, and GCC 13
dnf install -y akmod-nvidia xorg-x11-drv-nvidia-cuda gcc13-c++

# Download CUDA installer if not exists
if [ ! -f "${cudaInstaller}" ]; then
  wget https://developer.download.nvidia.com/compute/cuda/12.6.2/local_installers/${cudaInstaller}
fi

# Install CUDA toolkit
sh ${cudaInstaller} --toolkit --toolkitpath=/usr/local/cuda-12.6 --silent --override

# Clean up installer
rm -f ${cudaInstaller}

# Configure library paths
echo "/usr/local/cuda/lib64" >> /etc/ld.so.conf.d/cuda.conf
ldconfig -v`;

        // Execute all commands in one privilege elevation
        await runWithPrivileges(installScript);

        // Set up CUDA environment variables
        process.env.PATH = `/usr/local/cuda/bin:${process.env.PATH}`;
        process.env.LD_LIBRARY_PATH = `/usr/local/cuda/lib64:${
          process.env.LD_LIBRARY_PATH || ""
        }`;
        process.env.CUDA_HOME = "/usr/local/cuda";
        process.env.CUDACXX = "/usr/local/cuda/bin/nvcc";

        // Set NVCC to use GCC 13
        process.env.NVCC_PREPEND_FLAGS = "-ccbin /usr/bin/g++-13";
      }
    }
  }
}
