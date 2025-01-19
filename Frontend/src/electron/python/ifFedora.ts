import { execSync } from "child_process";
import fs from "fs";
import log from "electron-log";

export async function ifFedora() {
  if (fs.existsSync("/etc/fedora-release")) {
    try {
      log.info("Fedora system detected, checking CUDA toolkit");
      execSync("which nvcc");
      log.info("CUDA toolkit already installed");
      
      // Set up CUDA environment variables
      process.env.PATH = `/usr/bin:/usr/local/cuda/bin:${process.env.PATH}`;
      process.env.LD_LIBRARY_PATH = `/usr/lib64:/usr/local/cuda/lib64:${
        process.env.LD_LIBRARY_PATH || ""
      }`;
      process.env.CUDA_HOME = "/usr/local/cuda";
      process.env.CUDACXX = "/usr/bin/nvcc";

      // Set NVCC to use GCC 13
      process.env.NVCC_PREPEND_FLAGS = "-ccbin /usr/bin/g++-13";
    } catch {
      log.info("CUDA toolkit not found in path. It should be installed through the package manager.");
      log.info("If CUDA is still not working after installation, please restart your system.");
    }
  }
}
