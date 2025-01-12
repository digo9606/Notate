import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

from src.models.loaders.base import BaseLoader
from src.models.exceptions import ModelLoadError
from transformers import AutoTokenizer

logger = logging.getLogger(__name__)

class ExLlamaV2Loader(BaseLoader):
    """Loader for ExLlamaV2 models."""

    def load(self) -> Tuple[Any, Any]:
        """Load an ExLlamav2 model."""
        try:
            from exllamav2 import ExLlamaV2, ExLlamaV2Config, ExLlamaV2Tokenizer
        except ImportError:
            raise ModelLoadError(
                "exllamav2 is not installed. Please install it from the ExLlamaV2 repository")

        if not self.model_path.exists():
            raise ModelLoadError(f"Model path does not exist: {self.model_path}")

        config = ExLlamaV2Config()
        config.model_dir = str(self.model_path)
        config.max_seq_len = self.request.max_seq_len or 2048
        config.compress_pos_emb = self.request.compress_pos_emb
        config.alpha_value = self.request.alpha_value

        model = ExLlamaV2(config)
        model.load()

        tokenizer = ExLlamaV2Tokenizer(config)

        return model, tokenizer

    def get_metadata(self) -> Optional[Dict[str, Any]]:
        """Get model metadata."""
        if not self.model_path.exists():
            return None
        return {
            "model_type": "ExLlamav2",
            "model_path": str(self.model_path),
            "file_size": self.model_path.stat().st_size
        }

    def get_config(self) -> Dict[str, Any]:
        """Get model configuration."""
        return {
            "model_type": "ExLlamav2",
            "model_name": self.request.model_name,
            "device": self.request.device,
            "max_seq_len": self.request.max_seq_len,
            "compress_pos_emb": self.request.compress_pos_emb,
            "alpha_value": self.request.alpha_value
        }


class ExLlamaV2HFLoader(BaseLoader):
    """Loader for ExLlamaV2 models with HuggingFace tokenizer."""

    def load(self) -> Tuple[Any, Any]:
        """Load an ExLlamav2 model with HF tokenizer."""
        model = ExLlamaV2Loader(self.request, self.manager).load()[0]
        tokenizer_path = self.request.tokenizer_path or self.model_path

        tokenizer = AutoTokenizer.from_pretrained(
            tokenizer_path,
            trust_remote_code=self.request.trust_remote_code,
            use_fast=self.request.use_fast_tokenizer,
        )

        return model, tokenizer

    def get_metadata(self) -> Optional[Dict[str, Any]]:
        """Get model metadata."""
        return ExLlamaV2Loader(self.request, self.manager).get_metadata()

    def get_config(self) -> Dict[str, Any]:
        """Get model configuration."""
        return ExLlamaV2Loader(self.request, self.manager).get_config()
