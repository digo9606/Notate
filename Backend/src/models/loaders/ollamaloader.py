import logging
import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
import os

from src.models.loaders.base import BaseLoader
from src.models.exceptions import ModelLoadError

logger = logging.getLogger(__name__)


class OllamaLoader(BaseLoader):
    """
    Loader for Ollama models from manifest/blobs directory structure.
    This loader handles models that are stored in the Ollama format with manifests and blobs.
    """

    def __init__(self, request: Any, manager: Any):
        super().__init__(request, manager)
        self.ollama_dir = self._get_ollama_dir()

    def _get_ollama_dir(self) -> Path:
        """Get the Ollama models directory based on the platform."""
        if self.request.model_path:
            return Path(self.request.model_path)
        
        # Default Ollama paths by platform
        if os.name == 'nt':  # Windows
            base = Path(os.environ.get('LOCALAPPDATA', '')) / 'ollama'
        else:  # Unix-like systems (Linux, macOS)
            base = Path.home() / '.ollama'
        
        return base / 'models'

    def _find_manifest_file(self, model_dir: Path) -> Optional[Path]:
        """Find the manifest file in the model directory."""
        try:
            # Check for manifest.json directly
            manifest = model_dir / 'manifest.json'
            if manifest.is_file():
                return manifest
            
            # Look for any file that might be the manifest
            # Ollama sometimes uses names like '7b' without extension
            files = list(model_dir.glob('*'))
            # Filter out directories and hidden files
            manifest_candidates = [f for f in files if f.is_file() and not f.name.startswith('.')]
            
            if manifest_candidates:
                # Try to parse each file as JSON until we find one that works
                for candidate in manifest_candidates:
                    try:
                        with open(candidate, 'r') as f:
                            json.load(f)  # Test if it's valid JSON
                        return candidate
                    except json.JSONDecodeError:
                        continue
            
            return None
        except Exception as e:
            logger.error(f"Error finding manifest file: {str(e)}")
            return None

    def load(self) -> Tuple[Any, Any]:
        """
        Load an Ollama model from its manifest and blob files.

        Returns:
            Tuple[model, tokenizer] where both are the same object for Ollama models

        Raises:
            ModelLoadError: If there's an error loading the model
        """
        try:
            # Validate that the model base directory exists
            if not self.ollama_dir.exists():
                raise ModelLoadError(f"Ollama models directory does not exist: {self.ollama_dir}")

            # Construct paths to manifests and blobs directories
            manifest_dir = self.ollama_dir / "manifests"
            blobs_dir = self.ollama_dir / "blobs"

            if not manifest_dir.exists() or not blobs_dir.exists():
                raise ModelLoadError(f"Required directories not found in {self.ollama_dir}. Need both 'manifests' and 'blobs' directories.")

            # Find the model directory
            if '/' in self.request.model_name:
                # HuggingFace model
                model_dir = manifest_dir / "hf.co" / self.request.model_name
            else:
                # Official Ollama model
                model_dir = manifest_dir / "registry.ollama.ai" / "library" / self.request.model_name

            if not model_dir.exists():
                raise ModelLoadError(f"Model directory not found: {model_dir}")

            # Find and load the manifest file
            manifest_path = self._find_manifest_file(model_dir)
            if not manifest_path:
                raise ModelLoadError(f"No manifest file found in {model_dir}")

            try:
                with open(manifest_path, 'r') as f:
                    manifest = json.load(f)
                logger.info(f"Loaded manifest for model {self.request.model_name}")
            except json.JSONDecodeError as e:
                raise ModelLoadError(f"Invalid manifest file: {str(e)}")
            except Exception as e:
                raise ModelLoadError(f"Error reading manifest file: {str(e)}")

            # Here we would initialize the actual model using the manifest and blobs
            # For now, we'll return a simple object with the model info
            model = {
                "name": self.request.model_name,
                "manifest": manifest,
                "manifest_path": str(manifest_path),
                "blobs_dir": str(blobs_dir)
            }

            logger.info(f"Successfully loaded Ollama model {self.request.model_name}")
            return model, model  # Ollama includes its own tokenizer

        except Exception as e:
            raise ModelLoadError(f"Failed to load Ollama model: {str(e)}")

    def get_metadata(self) -> Optional[Dict[str, Any]]:
        """Get model metadata without loading the full model."""
        try:
            if '/' in self.request.model_name:
                # HuggingFace model
                model_dir = self.ollama_dir / "manifests" / "hf.co" / self.request.model_name
            else:
                # Official Ollama model
                model_dir = self.ollama_dir / "manifests" / "registry.ollama.ai" / "library" / self.request.model_name

            manifest_path = self._find_manifest_file(model_dir)

            if not manifest_path or not manifest_path.exists():
                return None

            with open(manifest_path, 'r') as f:
                manifest = json.load(f)

            metadata = {
                "model_type": "ollama",
                "model_name": self.request.model_name,
                "model_path": str(manifest_path),
                "file_size": manifest_path.stat().st_size,
                "manifest": manifest
            }

            return metadata
        except Exception as e:
            logger.error(f"Error getting model metadata: {str(e)}")
            return None

    def get_config(self) -> Dict[str, Any]:
        """Get the current model configuration."""
        return {
            "model_type": "ollama",
            "model_name": self.request.model_name,
            "model_path": str(self.ollama_dir)
        }

    @staticmethod
    def cleanup(model: Any) -> None:
        """Clean up model resources."""
        try:
            del model
        except:
            pass
