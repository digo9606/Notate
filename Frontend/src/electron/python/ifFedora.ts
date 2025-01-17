import { execSync } from "child_process";
import fs from "fs";
import log from "electron-log";

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
          `sudo sh ${cudaInstaller} --toolkit --toolkitpath=/usr/local/cuda-12.6 --silent --override`
        );

        // Clean up installer
        fs.unlinkSync(cudaInstaller);
      }

      // Set up CUDA environment variables
      process.env.PATH = `/usr/local/cuda/bin:${process.env.PATH}`;
      process.env.LD_LIBRARY_PATH = `/usr/local/cuda/lib64:${
        process.env.LD_LIBRARY_PATH || ""
      }`;
      process.env.CUDA_HOME = "/usr/local/cuda";
      process.env.CUDACXX = "/usr/local/cuda/bin/nvcc";

      // Set NVCC to use GCC 13
      process.env.NVCC_PREPEND_FLAGS = "-ccbin /usr/bin/g++-13";

      // Configure library paths
      execSync(
        "sudo sh -c 'echo \"/usr/local/cuda/lib64\" >> /etc/ld.so.conf.d/cuda.conf'"
      );
      execSync("sudo ldconfig -v");
    }
  }
}
