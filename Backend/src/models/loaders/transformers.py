import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union
import torch
from transformers import (
    AutoModel,
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    AutoConfig,
    PreTrainedModel,
    PreTrainedTokenizer
)

from src.models.loaders.base import BaseLoader
from src.models.exceptions import ModelLoadError, ModelDownloadError

logger = logging.getLogger(__name__)

class TransformersLoader(BaseLoader):
    """
    Loader for Hugging Face Transformers models.
    Handles both local and remote model loading with various optimizations.
    """

    def load(self) -> Tuple[PreTrainedModel, PreTrainedTokenizer]:
        """
        Load a Hugging Face Transformers model and tokenizer.
        
        Returns:
            Tuple[model, tokenizer]
            
        Raises:
            ModelLoadError: If there's an error loading the model
            ModelDownloadError: If there's an error downloading the model
        """
        try:
            self.prepare_loading()
            
            # Try to download from HuggingFace if it's a HF model ID
            if '/' in self.request.model_name:
                return self._download_and_load_model()
            
            # Load local model
            return self._load_local_model()
            
        except Exception as e:
            self.log_error(e, "Failed to load Transformers model")
            if isinstance(e, (ModelLoadError, ModelDownloadError)):
                raise
            raise ModelLoadError(str(e))

    def _download_and_load_model(self) -> Tuple[PreTrainedModel, PreTrainedTokenizer]:
        """Download and load model from HuggingFace."""
        logger.info(f"Attempting to download from HuggingFace: {self.request.model_name}")
        
        try:
            # Load tokenizer
            tokenizer = self._load_tokenizer(self.request.model_name)
            tokenizer.save_pretrained(self.model_path)
            logger.info(f"Tokenizer downloaded and saved to {self.model_path}")

            # Load config
            config = self._load_config(self.request.model_name)
            config.save_pretrained(self.model_path)
            logger.info(f"Config downloaded and saved to {self.model_path}")

            # Load model
            logger.info("Downloading model weights (this may take a while)...")
            model = self._load_model_with_config(self.request.model_name, config)
            model.save_pretrained(self.model_path)
            logger.info(f"Model downloaded and saved to {self.model_path}")

            return model, tokenizer

        except Exception as e:
            if "401" in str(e) and not self.request.hf_token:
                raise ModelDownloadError(
                    f"Model {self.request.model_name} requires authentication. Please provide a HuggingFace token.")
            raise ModelDownloadError(f"Failed to download model: {str(e)}")

    def _load_local_model(self) -> Tuple[PreTrainedModel, PreTrainedTokenizer]:
        """Load model from local storage."""
        if not self.model_path.exists():
            raise ModelLoadError(
                f"Model path does not exist and is not a valid HuggingFace model ID: {self.model_path}")

        # Load config
        config = self._load_config(self.model_path)
        
        # Load model
        model = self._load_model_with_config(self.model_path, config)
        
        # Load tokenizer
        tokenizer = self._load_tokenizer(
            self.request.tokenizer_path or self.model_path
        )

        # Move model to device if needed
        if self.request.device != "cuda" and not (self.request.load_in_8bit or self.request.load_in_4bit):
            model = model.to(self.request.device)

        return model, tokenizer

    def _load_tokenizer(self, path: Union[str, Path]) -> PreTrainedTokenizer:
        """Load tokenizer with specified settings."""
        try:
            return AutoTokenizer.from_pretrained(
                path,
                trust_remote_code=self.request.trust_remote_code,
                use_fast=self.request.use_fast_tokenizer,
                padding_side=self.request.padding_side,
                revision=self.request.revision,
                token=self.request.hf_token
            )
        except Exception as e:
            if self.request.hf_token:
                raise
            # Try without token for public models
            return AutoTokenizer.from_pretrained(
                path,
                trust_remote_code=self.request.trust_remote_code,
                use_fast=self.request.use_fast_tokenizer,
                padding_side=self.request.padding_side,
                revision=self.request.revision
            )

    def _load_config(self, path: Union[str, Path]) -> AutoConfig:
        """Load model configuration."""
        return AutoConfig.from_pretrained(
            path,
            trust_remote_code=self.request.trust_remote_code,
            revision=self.request.revision,
            token=self.request.hf_token
        )

    def _load_model_with_config(self, path: Union[str, Path], config: AutoConfig) -> PreTrainedModel:
        """Load model with configuration and parameters."""
        return AutoModelForCausalLM.from_pretrained(
            path,
            config=config,
            token=self.request.hf_token,
            **self._get_load_params()
        )

    def _get_load_params(self) -> Dict[str, Any]:
        """Get model loading parameters."""
        # Get the compute dtype
        compute_dtype = torch.bfloat16 if self.request.compute_dtype == "bfloat16" else torch.float16
        
        load_params = {
            "low_cpu_mem_usage": True,
            "torch_dtype": compute_dtype,  # Keep as torch.dtype for loading
            "trust_remote_code": self.request.trust_remote_code,
            "use_flash_attention_2": self.request.use_flash_attention,
            "device_map": "auto" if self.request.device == "cuda" else None,
            "revision": self.request.revision,
        }

        # Add gradient checkpointing for supported architectures
        if not any(x in self.request.model_name.lower() for x in ["phi", "falcon"]):
            load_params["use_gradient_checkpointing"] = True

        # Configure quantization
        if self.request.load_in_8bit or self.request.load_in_4bit:
            load_params["quantization_config"] = self._get_quantization_config()

        # Add optional parameters
        if self.request.max_memory is not None and self.request.device == "cuda":
            load_params["max_memory"] = self.request.max_memory

        if self.request.rope_scaling is not None:
            load_params["rope_scaling"] = self.request.rope_scaling

        if self.request.use_cache is False:
            load_params["use_cache"] = False

        # For model loading, return the original params with torch.dtype
        if not hasattr(self, '_serializing_for_response'):
            return load_params
            
        # For JSON response, convert torch.dtype to string
        response_params = load_params.copy()
        response_params["torch_dtype"] = str(compute_dtype)
        return response_params  # Return string version for JSON serialization

    def _get_quantization_config(self) -> BitsAndBytesConfig:
        """Get quantization configuration."""
        return BitsAndBytesConfig(
            load_in_8bit=self.request.load_in_8bit,
            load_in_4bit=self.request.load_in_4bit,
            bnb_4bit_compute_dtype=eval(f"torch.{self.request.compute_dtype}"),
            llm_int8_enable_fp32_cpu_offload=True,
            bnb_4bit_use_double_quant=True
        )

    def get_metadata(self) -> Optional[Dict[str, Any]]:
        """Get model metadata without loading the full model."""
        try:
            if '/' in self.request.model_name and not self.model_path.exists():
                config = self._load_config(self.request.model_name)
                metadata = self._make_json_serializable(config.to_dict())
                metadata['model_type'] = 'Transformers'
                return metadata

            if self.model_path.exists():
                config = self._load_config(self.model_path)
                metadata = self._make_json_serializable(config.to_dict())
                metadata['model_type'] = 'Transformers'
                return metadata

            return None
        except Exception as e:
            logger.error(f"Error getting model metadata: {str(e)}")
            return None

    def get_config(self) -> Dict[str, Any]:
        """Get the current model configuration."""
        # Set flag to get JSON serializable params
        self._serializing_for_response = True
        load_params = self._get_load_params()
        delattr(self, '_serializing_for_response')
        
        config = {
            "model_type": "Transformers",
            "model_name": self.request.model_name,
            "device": self.request.device,
            "load_params": load_params
        }
        
        if self.model_path.exists():
            try:
                model_config = self._load_config(self.model_path)
                config["model_config"] = model_config.to_dict()
            except Exception as e:
                logger.warning(f"Could not load model config: {str(e)}")
        
        return self._make_json_serializable(config)

    def _make_json_serializable(self, obj: Any) -> Any:
        """Convert a dictionary with torch dtypes to JSON serializable format."""
        if isinstance(obj, dict):
            return {k: self._make_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._make_json_serializable(v) for v in obj]
        elif hasattr(obj, 'dtype'):  # Handle torch dtypes
            return str(obj)
        return obj

    @staticmethod
    def cleanup(model: PreTrainedModel) -> None:
        """Clean up model resources."""
        try:
            if hasattr(model, 'cpu'):
                model.cpu()
            del model
        except Exception as e:
            logger.warning(f"Error during model cleanup: {str(e)}")