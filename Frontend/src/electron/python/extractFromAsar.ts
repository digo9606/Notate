import fs from "fs";
import path from "path";
import log from "electron-log";
        
export function extractFromAsar(sourcePath: string, destPath: string) {
 
    log.info(`Extracting from ${sourcePath} to ${destPath}`);
  try {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source path does not exist: ${sourcePath}`);
    }
    if (!fs.existsSync(destPath)) {
      log.info(`Creating directory: ${destPath}`);
      fs.mkdirSync(destPath, { recursive: true });
    }

    const files = fs.readdirSync(sourcePath);
    log.info(`Files in source: ${files.join(", ")}`);
    files.forEach((file) => {
      const fullSourcePath = path.join(sourcePath, file);
      const fullDestPath = path.join(destPath, file);

      if (fs.statSync(fullSourcePath).isDirectory()) {
        log.info(`Extracting directory: ${file}`);
        extractFromAsar(fullSourcePath, fullDestPath);
      } else {
        log.info(`Copying file: ${file}`);
        fs.copyFileSync(fullSourcePath, fullDestPath);
      }
    });
    log.info(`Extraction completed for ${sourcePath}`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      log.error(`Error in extractFromAsar: ${error.message}`);
      log.error(`Stack trace: ${error.stack}`);
    } else {
      log.error(`Unknown error in extractFromAsar: ${error}`);
    }
    throw error;
  }
}
