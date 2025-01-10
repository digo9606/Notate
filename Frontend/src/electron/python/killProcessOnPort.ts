import { exec } from "child_process";
import log from "electron-log";

export async function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const command =
      process.platform === "win32"
        ? `netstat -ano | findstr :${port}`
        : `lsof -i :${port} | grep LISTEN`;

    exec(command, (error, stdout) => {
      if (error) {
        log.error(`Failed to find process on port ${port}: ${error}`);
        resolve(); // Resolve anyway since there might not be a process
        return;
      }

      if (!stdout) {
        resolve();
        return;
      }

      // Extract PID based on platform
      let pid: string | null = null;
      if (process.platform === "win32") {
        const match = stdout.match(/\s+(\d+)\s*$/m);
        if (match) pid = match[1];
      } else {
        const match = stdout.match(/\S+\s+(\d+)/);
        if (match) pid = match[1];
      }

      if (!pid) {
        resolve();
        return;
      }

      // Kill the process
      const killCommand =
        process.platform === "win32"
          ? `taskkill /F /PID ${pid}`
          : `kill ${pid}`;

      exec(killCommand, (killError) => {
        if (killError) {
          log.error(`Failed to kill process ${pid}: ${killError}`);
        } else {
          log.info(`Successfully killed process ${pid} on port ${port}`);
        }
        resolve();
      });
    });
  });
}
