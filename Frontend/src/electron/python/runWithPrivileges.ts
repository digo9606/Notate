import { execSync } from "child_process";
import { dialog } from "electron";
import log from "electron-log";


export async function runWithPrivileges(commands: string | string[]): Promise<void> {
    if (process.platform !== "linux") return;
  
    const commandArray = Array.isArray(commands) ? commands : [commands];
  
    try {
      // Try without privileges first
      for (const cmd of commandArray) {
        execSync(cmd);
      }
    } catch {
      log.info("Failed to run commands, requesting privileges..., ");
  
      const response = await dialog.showMessageBox({
        type: "question",
        buttons: ["Grant Privileges", "Cancel"],
        defaultId: 0,
        title: "Administrator Privileges Required",
        message:
          "Creating the Python environment requires administrator privileges.",
        detail:
          "This is needed to install required system dependencies and create the virtual environment. This will only be needed once.",
      });
  
      if (response.response === 0) {
        try {
          // Combine all commands with && to run them in sequence
          const combinedCommand = commandArray.join(" && ");
          execSync(`pkexec sh -c '${combinedCommand}'`);
        } catch (error) {
          log.error("Failed to run commands with privileges", error);
          throw new Error("Failed to run commands with elevated privileges");
        }
      } else {
        throw new Error(
          "User declined to grant administrator privileges. Cannot continue."
        );
      }
    }
  }