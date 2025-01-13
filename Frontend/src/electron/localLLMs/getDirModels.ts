import fs from "fs";
import path from "path";

function determineModelType(modelPath: string, name: string): string {
  // Check file extension for common model formats
  if (name.toLowerCase().endsWith('.gguf')) {
    return 'llama.cpp';
  } else if (name.toLowerCase().endsWith('.hqq')) {
    return 'hqq';
  }

  // Check if it's in the Ollama registry path
  if (modelPath.includes('registry.ollama.ai')) {
    return 'ollama';
  }

  // Check if it's in the HuggingFace path
  if (modelPath.includes('hf.co')) {
    // If it's a GGUF model from HF, mark as llama.cpp
    if (name.toLowerCase().includes('gguf')) {
      return 'llama.cpp';
    }
    return 'huggingface';
  }

  return 'unknown';
}

export async function getDirModels(payload: {
  dirPath: string;
}): Promise<Model[]> {
  const { dirPath } = payload;

  console.log("Checking directory:", dirPath);
  if (!fs.existsSync(dirPath)) {
    console.log("Directory does not exist");
    return [];
  }

  // List contents of the directory to debug
  const contents = fs.readdirSync(dirPath);
  console.log("Directory contents:", contents);

  // For Ollama models, we need to check the manifests directory
  const manifestsDir = path.join(dirPath, "manifests");
  console.log("Checking manifests directory:", manifestsDir);

  if (fs.existsSync(manifestsDir)) {
    try {
      const models: Model[] = [];

      // Check registry.ollama.ai/library for official models
      const registryPath = path.join(
        manifestsDir,
        "registry.ollama.ai",
        "library"
      );
      if (fs.existsSync(registryPath)) {
        const entries = fs.readdirSync(registryPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            console.log("Found model:", entry.name);
            const modelPath = path.join(registryPath, entry.name);
            const stats = fs.statSync(modelPath);
            
            models.push({
              name: entry.name,
              type: determineModelType(modelPath, entry.name),
              model_location: modelPath,
              modified_at: stats.mtime.toISOString(),
              size: stats.size,
              digest: "", // Would need to read from manifest file if needed
            });
          }
        }
      }

      // Check hf.co for HuggingFace models
      const hfPath = path.join(manifestsDir, "hf.co");
      if (fs.existsSync(hfPath)) {
        const processHFDir = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              const subEntries = fs.readdirSync(path.join(dir, entry.name), {
                withFileTypes: true,
              });
              for (const subEntry of subEntries) {
                if (subEntry.isDirectory() && !subEntry.name.startsWith(".")) {
                  console.log("Found HF model:", subEntry.name);
                  const modelPath = path.join(dir, entry.name, subEntry.name);
                  const stats = fs.statSync(modelPath);
                  
                  models.push({
                    name: subEntry.name,
                    type: determineModelType(modelPath, subEntry.name),
                    model_location: modelPath,
                    modified_at: stats.mtime.toISOString(),
                    size: stats.size,
                    digest: "", // Would need to read from manifest file if needed
                  });
                }
              }
            }
          }
        };
        processHFDir(hfPath);
      }

      return models;
    } catch (err) {
      console.error("Error reading models directory:", err);
      return [];
    }
  } else {
    console.log("No manifests directory found");
  }

  return [];
}
