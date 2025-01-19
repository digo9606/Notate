import { execSync } from "child_process";
import fs from "fs";
import log from "electron-log";

export function getLinuxPackageManager(): {
  command: string;
  installCommand: string;
} {
  // Check for Fedora-based system first
  if (fs.existsSync("/etc/fedora-release")) {
    try {
      execSync("which dnf");
      const fedoraVersion = fs
        .readFileSync("/etc/fedora-release", "utf8")
        .match(/\d+/)?.[0];

      return {
        command: "dnf",
        installCommand: `dnf -y update && dnf -y --setopt=install_weak_deps=False --allowerasing install python3-devel gcc gcc-c++ && \
dnf -y --setopt=install_weak_deps=False install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-${fedoraVersion}.noarch.rpm https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${fedoraVersion}.noarch.rpm && \
dnf -y --setopt=install_weak_deps=False --allowerasing install akmod-nvidia xorg-x11-drv-nvidia-cuda nvidia-cuda-toolkit gcc13-c++`,
      };
    } catch {
      log.info("Fedora-based system detected but dnf not found");
    }
  }

  try {
    // Check for apt-get (Debian/Ubuntu/Mint)
    execSync("which apt-get");
    return {
      command: "apt-get",
      installCommand:
        "apt-get update && apt-get install -y python3-venv python3-dev build-essential",
    };
  } catch {
    try {
      // Check for DNF (other RHEL-based systems)
      execSync("which dnf");
      return {
        command: "dnf",
        installCommand: "dnf install -y python3-devel gcc gcc-c++",
      };
    } catch {
      try {
        // Check for zypper (openSUSE)
        execSync("which zypper");
        return {
          command: "zypper",
          installCommand:
            "zypper install -y python3-venv python3-devel gcc gcc-c++",
        };
      } catch {
        // Check for pacman (Arch Linux)
        try {
          execSync("which pacman");
          return {
            command: "pacman",
            installCommand:
              "pacman -S --noconfirm python-virtualenv python gcc",
          };
        } catch {
          throw new Error("No supported package manager found");
        }
      }
    }
  }
}
