import os
import gc
import torch
import json
import logging
import platform
from pathlib import Path
from typing import Optional, Tuple, Any, Dict, Union, List
from transformers import (
    AutoModel,
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    AutoConfig,
    PreTrainedModel,
    PreTrainedTokenizer
)
from ..endpoint.models import ModelLoadRequest

logger = logging.getLogger(__name__)

def detect_model_type(model_path: Union[str, Path]) -> str:
    """
    Detect the model type from the model files and metadata
    Returns one of: 'Transformers', 'llama.cpp', 'llamacpp_HF', 'ExLlamav2', 'ExLlamav2_HF', 'HQQ', 'TensorRT-LLM'
    """
    model_path = Path(model_path)
    if not model_path.exists():
        raise ValueError(f"Model path does not exist: {model_path}")

    # Check for model metadata
    metadata_path = model_path / "metadata.json"
    if metadata_path.exists():
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
                if "model_type" in metadata:
                    return metadata["model_type"]
        except:
            logger.warning(f"Could not read metadata from {metadata_path}")

    # Check for specific file patterns
    files = list(model_path.glob("*"))
    file_names = [f.name for f in files]

    # TensorRT-LLM check
    if any(f.endswith('.engine') for f in file_names) or any(f.endswith('.plan') for f in file_names):
        return 'TensorRT-LLM'

    # llama.cpp check
    if any(f.endswith('.gguf') for f in file_names):
        # Check if there's a HF tokenizer
        if any(f == 'tokenizer_config.json' for f in file_names):
            return 'llamacpp_HF'
        return 'llama.cpp'

    # HQQ check
    if any(f.endswith('.hqq') for f in file_names):
        return 'HQQ'

    # Default to Transformers for standard HF models
    if any(f in file_names for f in ['config.json', 'pytorch_model.bin', 'model.safetensors']):
        # Only check for ExLlamav2 if we find specific ExLlamav2 files
        if (model_path / 'tokenizer.model').exists():
            config_path = model_path / 'config.json'
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    if config.get('model_type', '').lower() in ['llama', 'mistral']:
                        return 'ExLlamav2'
            except:
                pass
        return 'Transformers'

    raise ValueError(f"Could not determine model type from files in {model_path}")


class ModelManager:
    def __init__(self):
        self.current_model: Optional[Union[PreTrainedModel, Any]] = None
        self.current_tokenizer: Optional[Union[PreTrainedTokenizer, Any]] = None
        self.model_type: Optional[str] = None
        self.device: Optional[str] = None
        self.model_name: Optional[str] = None
        self._is_loading: bool = False
        self.model_config: Optional[Dict[str, Any]] = None

    def get_model_metadata(self, request: ModelLoadRequest) -> Optional[Dict[str, Any]]:
        """Get model metadata without loading the full model"""
        try:
            model_path = Path(request.model_path) if request.model_path else Path(f"models/{request.model_name}")
            
            # If it's a HuggingFace model ID and doesn't exist locally
            if '/' in request.model_name and not model_path.exists():
                try:
                    config = AutoConfig.from_pretrained(
                        request.model_name,
                        trust_remote_code=request.trust_remote_code,
                        revision=request.revision,
                        token=request.hf_token
                    )
                    metadata = config.to_dict()
                    # Determine model type from architecture
                    arch = metadata.get('architectures', [''])[0].lower()
                    if 'llama' in arch or 'mistral' in arch:
                        metadata['model_type'] = 'ExLlamav2'
                    else:
                        metadata['model_type'] = 'Transformers'
                    return metadata
                except:
                    # If failed with token, try without (for public models)
                    if request.hf_token:
                        try:
                            config = AutoConfig.from_pretrained(
                                request.model_name,
                                trust_remote_code=request.trust_remote_code,
                                revision=request.revision
                            )
                            metadata = config.to_dict()
                            arch = metadata.get('architectures', [''])[0].lower()
                            if 'llama' in arch or 'mistral' in arch:
                                metadata['model_type'] = 'ExLlamav2'
                            else:
                                metadata['model_type'] = 'Transformers'
                            return metadata
                        except:
                            return None
                    return None
            
            # For local models
            if model_path.exists():
                # Try to detect model type first
                try:
                    detected_type = detect_model_type(model_path)
                    metadata = {"model_type": detected_type}
                    
                    # Try to load config if it exists
                    config_path = model_path / 'config.json'
                    if config_path.exists():
                        with open(config_path, 'r') as f:
                            config = json.load(f)
                            metadata.update(config)
                    
                    return metadata
                except:
                    return None
            
            return None
        except Exception as e:
            logger.error(f"Error getting model metadata: {str(e)}")
            return None

    def is_model_loaded(self) -> bool:
        return self.current_model is not None

    def get_model_info(self) -> Dict[str, Any]:
        info = {
            "model_name": self.model_name,
            "model_type": self.model_type,
            "device": self.device,
            "is_loaded": self.is_model_loaded(),
            "is_loading": self._is_loading,
        }
        if self.model_config:
            info["config"] = self.model_config
        return info

    def clear_model(self) -> None:
        """Unload the current model and clear CUDA cache"""
        if self.current_model is not None:
            try:
                if hasattr(self.current_model, 'cpu'):
                    self.current_model.cpu()
            except:
                pass
            del self.current_model
            self.current_model = None

        if self.current_tokenizer is not None:
            del self.current_tokenizer
            self.current_tokenizer = None
        
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        self.model_type = None
        self.device = None
        self.model_name = None
        self.model_config = None

    def _get_device(self, request: ModelLoadRequest) -> str:
        if request.device != "auto":
            return request.device
        
        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"

    def check_platform_compatibility(self, model_type: str) -> Tuple[bool, str]:
        """
        Check if the model type is compatible with the current platform
        Returns (is_compatible, message)
        """
        current_platform = platform.system().lower()
        
        platform_compatibility = {
            'TensorRT-LLM': ['linux'],  # TensorRT only works on Linux
            'ExLlamav2': ['windows', 'linux'],  # ExLlama works on Windows and Linux
            'ExLlamav2_HF': ['windows', 'linux'],
            'HQQ': ['linux', 'windows', 'darwin'],  # HQQ works on all platforms
            'llama.cpp': ['linux', 'windows', 'darwin'],  # llama.cpp works on all platforms
            'llamacpp_HF': ['linux', 'windows', 'darwin'],
            'Transformers': ['linux', 'windows', 'darwin']  # Transformers works on all platforms
        }
        
        compatible_platforms = platform_compatibility.get(model_type, [])
        is_compatible = current_platform in compatible_platforms
        
        if not is_compatible:
            message = f"Model type '{model_type}' is not compatible with {platform.system()}. Compatible platforms: {', '.join(compatible_platforms)}"
        else:
            message = f"Model type '{model_type}' is compatible with {platform.system()}"
        
        return is_compatible, message

    def load_model(self, request: ModelLoadRequest) -> Tuple[Any, Any]:
        """Load a model based on the request configuration"""
        if self._is_loading:
            raise RuntimeError("A model is already being loaded")

        try:
            self._is_loading = True
            self.clear_model()  # Clear any existing model

            # Determine model path
            model_path = Path(request.model_path) if request.model_path else Path(f"models/{request.model_name}")
            
            # Create models directory if it doesn't exist
            model_path.parent.mkdir(parents=True, exist_ok=True)

            # Auto-detect model type if not specified or auto
            if not request.model_type or request.model_type == "auto":
                if model_path.exists():
                    detected_type = detect_model_type(model_path)
                    logger.info(f"Detected model type: {detected_type} for {model_path}")
                    request.model_type = detected_type
                else:
                    # Default to Transformers for HF models
                    request.model_type = "Transformers"
                    logger.info(f"Defaulting to Transformers model type for {request.model_name}")

            # Now that we have a concrete type (not auto), check platform compatibility
            if request.model_type:  # This will always be true at this point
                is_compatible, message = self.check_platform_compatibility(request.model_type)
                if not is_compatible:
                    raise ValueError(message)
                logger.info(message)

            self.device = self._get_device(request)
            self.model_name = request.model_name
            self.model_type = request.model_type

            # Map model types to their loader functions
            loaders = {
                'Transformers': self._load_transformers_model,
                'llama.cpp': self._load_llamacpp_model,
                'llamacpp_HF': self._load_llamacpp_hf_model,
                'ExLlamav2': self._load_exllamav2_model,
                'ExLlamav2_HF': self._load_exllamav2_hf_model,
                'HQQ': self._load_hqq_model,
                'TensorRT-LLM': self._load_tensorrt_model
            }

            loader = loaders.get(request.model_type)
            if loader is None:
                raise ValueError(f"Unsupported model type: {request.model_type}")

            return loader(request)
        finally:
            self._is_loading = False

    def _load_transformers_model(self, request: ModelLoadRequest) -> Tuple[PreTrainedModel, PreTrainedTokenizer]:
        """Load a Hugging Face Transformers model"""
        model_path = Path(request.model_path) if request.model_path else Path(f"models/{request.model_name}")
        
        # Create models directory if it doesn't exist
        model_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Try to download from HuggingFace if it's a HF model ID
        if '/' in request.model_name:
            logger.info(f"Attempting to download from HuggingFace: {request.model_name}")
            try:
                # First try with token if provided
                token = request.hf_token

                def progress_callback(current: int, total: int):
                    if total > 0:
                        percentage = (current / total) * 100
                        logger.info(f"Download progress: {percentage:.1f}% ({current}/{total} bytes)")

                try:
                    # Try to load the tokenizer
                    logger.info("Downloading tokenizer...")
                    tokenizer = AutoTokenizer.from_pretrained(
                        request.model_name,
                        trust_remote_code=request.trust_remote_code,
                        use_fast=request.use_fast_tokenizer,
                        padding_side=request.padding_side,
                        revision=request.revision,
                        token=token
                    )
                except Exception as e:
                    if token:  # If token was provided but failed, raise the error
                        raise
                    # If no token was provided, try without token (for public models)
                    logger.info("No token provided or token failed, trying as public model")
                    tokenizer = AutoTokenizer.from_pretrained(
                        request.model_name,
                        trust_remote_code=request.trust_remote_code,
                        use_fast=request.use_fast_tokenizer,
                        padding_side=request.padding_side,
                        revision=request.revision
                    )

                tokenizer.save_pretrained(model_path)
                logger.info(f"Tokenizer downloaded and saved to {model_path}")

                # Then try to load the config
                logger.info("Downloading model configuration...")
                config = AutoConfig.from_pretrained(
                    request.model_name,
                    trust_remote_code=request.trust_remote_code,
                    revision=request.revision,
                    token=token
                )
                config.save_pretrained(model_path)
                logger.info(f"Config downloaded and saved to {model_path}")

                # Finally, download the model
                logger.info("Downloading model weights (this may take a while)...")
                model = AutoModelForCausalLM.from_pretrained(
                    request.model_name,
                    config=config,
                    token=token,
                    **self._get_load_params(request)
                )
                model.save_pretrained(model_path)
                logger.info(f"Model downloaded and saved to {model_path}")

                self.current_model = model
                self.current_tokenizer = tokenizer
                self.model_config = config.to_dict()
                return model, tokenizer

            except Exception as e:
                logger.error(f"Error downloading model: {str(e)}")
                if "401" in str(e) and not request.hf_token:
                    raise ValueError(f"Model {request.model_name} requires authentication. Please provide a HuggingFace token.")
                raise ValueError(f"Could not download model {request.model_name}: {str(e)}")

        # If we get here, either the model exists locally or it's not a HF model ID
        if not model_path.exists():
            raise ValueError(f"Model path does not exist and is not a valid HuggingFace model ID: {model_path}")

        # Load and store config
        config = AutoConfig.from_pretrained(
            model_path,
            trust_remote_code=request.trust_remote_code,
            revision=request.revision
        )
        self.model_config = config.to_dict()

        # Load the model
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            config=config,
            **self._get_load_params(request)
        )

        # Load tokenizer with specified settings
        tokenizer_path = request.tokenizer_path or model_path
        tokenizer = AutoTokenizer.from_pretrained(
            tokenizer_path,
            trust_remote_code=request.trust_remote_code,
            use_fast=request.use_fast_tokenizer,
            padding_side=request.padding_side,
            revision=request.revision
        )

        # Move model to device if needed
        if self.device != "cuda" and not (request.load_in_8bit or request.load_in_4bit):
            model = model.to(self.device)

        # Store and return
        self.current_model = model
        self.current_tokenizer = tokenizer
        return model, tokenizer

    def _get_load_params(self, request: ModelLoadRequest) -> Dict[str, Any]:
        """Get model loading parameters"""
        load_params = {
            "low_cpu_mem_usage": True,
            "torch_dtype": torch.bfloat16 if request.compute_dtype == "bfloat16" else torch.float16,
            "trust_remote_code": request.trust_remote_code,
            "use_flash_attention_2": request.use_flash_attention,
            "device_map": "auto" if self.device == "cuda" else None,
            "revision": request.revision,
        }

        # Only add gradient checkpointing for supported architectures
        if not any(x in request.model_name.lower() for x in ["phi", "falcon"]):
            load_params["use_gradient_checkpointing"] = True

        if request.load_in_8bit or request.load_in_4bit:
            quantization_config = BitsAndBytesConfig(
                load_in_8bit=request.load_in_8bit,
                load_in_4bit=request.load_in_4bit,
                bnb_4bit_compute_dtype=eval(f"torch.{request.compute_dtype}"),
                llm_int8_enable_fp32_cpu_offload=True,
                bnb_4bit_use_double_quant=True  # Enable double quantization for better stability
            )
            load_params["quantization_config"] = quantization_config

        if request.max_memory is not None and self.device == "cuda":
            load_params["max_memory"] = request.max_memory

        if request.rope_scaling is not None:
            load_params["rope_scaling"] = request.rope_scaling

        # Only add use_cache if it's explicitly set to False
        if request.use_cache is False:
            load_params["use_cache"] = False

        return load_params

    def _load_llamacpp_model(self, request: ModelLoadRequest) -> Tuple[Any, Any]:
        """Load a llama.cpp model"""
        try:
            from llama_cpp import Llama, LlamaCache
            import requests
            from tqdm import tqdm
            import json
        except ImportError:
            raise ImportError("llama-cpp-python is not installed. Please install it with: pip install llama-cpp-python")

        model_path = Path(request.model_path) if request.model_path else Path(f"models/{request.model_name}")
        
        # Create models directory if it doesn't exist
        model_path.parent.mkdir(parents=True, exist_ok=True)

        # If it's a HuggingFace model ID and doesn't exist locally or is a directory
        if '/' in request.model_name and (not model_path.exists() or model_path.is_dir()):
            logger.info(f"Model not found locally, attempting to download: {request.model_name}")
            
            # Create the full directory path
            model_dir = model_path if model_path.is_dir() else model_path.parent
            model_dir.mkdir(parents=True, exist_ok=True)
            
            # Determine the repository ID
            repo_id = request.model_name
            
            try:
                # Get the list of files in the repository using the raw API
                api_url = f"https://huggingface.co/api/models/{repo_id}/tree/main"
                headers = {"Accept": "application/json"}
                if request.hf_token:
                    headers["Authorization"] = f"Bearer {request.hf_token}"
                
                response = requests.get(api_url, headers=headers)
                response.raise_for_status()
                files = response.json()
                
                # Find all GGUF files
                gguf_files = [f for f in files if f.get('path', '').endswith('.gguf')]
                if not gguf_files:
                    raise ValueError(f"No GGUF files found in repository {repo_id}")
                
                # Sort by size and prefer q4_k_m files
                gguf_files.sort(key=lambda x: (
                    0 if 'q4_k_m' in x['path'].lower() else 1,  # Prefer q4_k_m files
                    x.get('size', float('inf'))  # Then sort by size
                ))
                
                # Get the best file
                file_info = gguf_files[0]
                file_name = file_info['path']
                download_url = f"https://huggingface.co/{repo_id}/resolve/main/{file_name}"
                
                # Set the model path to include the file name
                model_path = model_dir / file_name
                
                # Download the file with progress bar
                logger.info(f"Downloading {file_name} to {model_path} ({file_info.get('size', 'unknown size')})...")
                response = requests.get(download_url, stream=True, headers=headers)
                response.raise_for_status()
                
                total_size = int(response.headers.get('content-length', 0))
                block_size = 8192  # 8 KB
                
                with open(model_path, 'wb') as f, tqdm(
                    desc=file_name,
                    total=total_size,
                    unit='iB',
                    unit_scale=True,
                    unit_divisor=1024,
                ) as pbar:
                    for data in response.iter_content(block_size):
                        size = f.write(data)
                        pbar.update(size)
                
                logger.info(f"Successfully downloaded {file_name}")
            except Exception as e:
                if model_path.exists() and model_path.stat().st_size == 0:
                    model_path.unlink()  # Remove empty/partial file
                raise ValueError(f"Failed to download model: {str(e)}")

        if not model_path.exists():
            raise ValueError(f"Model path does not exist: {model_path}")

        # Configure GPU layers and tensor cores
        gpu_layers = request.n_gpu_layers or 0
        if request.device == "mps" or (request.device == "auto" and hasattr(torch.backends, "mps") and torch.backends.mps.is_available()):
            # For M1/M2 Macs, if n_gpu_layers is not set, default to 1 layer
            gpu_layers = request.n_gpu_layers if request.n_gpu_layers is not None else 1
            logger.info("Using Metal acceleration for M1/M2 Mac")
        elif request.device == "cuda" or (request.device == "auto" and torch.cuda.is_available()):
            # For CUDA, if n_gpu_layers is not set, use all layers (value of 0)
            gpu_layers = request.n_gpu_layers if request.n_gpu_layers is not None else 0
            logger.info(f"Using CUDA acceleration with {gpu_layers} GPU layers")

        # Build model parameters with optimizations
        model_params = {
            "model_path": str(model_path),
            "n_ctx": int(request.n_ctx) if request.n_ctx is not None else 2048,
            "n_batch": int(request.n_batch) if request.n_batch is not None else 512,
            "n_threads": int(request.n_threads) if request.n_threads is not None else os.cpu_count(),
            "n_threads_batch": int(request.n_threads_batch) if request.n_threads_batch is not None else min(8, os.cpu_count()),
            "n_gpu_layers": int(gpu_layers),
            "main_gpu": int(request.main_gpu) if request.main_gpu is not None else 0,
        }

        # Add optional parameters only if they are not None
        if request.tensor_split is not None:
            model_params["tensor_split"] = request.tensor_split
        if request.mul_mat_q is not None:
            model_params["mul_mat_q"] = request.mul_mat_q
        if request.use_mmap is not None:
            model_params["use_mmap"] = request.use_mmap
        if request.use_mlock is not None:
            model_params["use_mlock"] = request.use_mlock
        if request.offload_kqv is not None:
            model_params["offload_kqv"] = request.offload_kqv
        if request.split_mode is not None:
            model_params["split_mode"] = request.split_mode
        if request.flash_attn is not None:
            model_params["flash_attn"] = request.flash_attn
        if request.cache_type is not None:
            model_params["type_k"] = request.cache_type
            model_params["type_v"] = request.cache_type

        # Add RoPE parameters if specified
        if request.rope_scaling_type:
            model_params["rope_scaling_type"] = request.rope_scaling_type
        if request.rope_freq_base is not None:
            model_params["rope_freq_base"] = request.rope_freq_base
        if request.rope_freq_scale is not None:
            model_params["rope_freq_scale"] = request.rope_freq_scale

        # Log GPU configuration
        if gpu_layers > 0:
            logger.info(f"GPU Configuration:")
            logger.info(f"  - GPU Layers: {gpu_layers}")
            logger.info(f"  - Main GPU: {request.main_gpu}")
            logger.info(f"  - Tensor Split: {request.tensor_split}")
            logger.info(f"  - Using Tensor Cores: {request.mul_mat_q}")
            logger.info(f"  - Flash Attention: {model_params['flash_attn']}")
            logger.info(f"  - KQV Offloading: {model_params['offload_kqv']}")
            logger.info(f"  - Cache Type: {request.cache_type}")
            logger.info(f"  - Split Mode: {model_params['split_mode']}")

        model = Llama(**model_params)

        # Set up cache with configurable size
        if hasattr(model, 'set_cache') and request.cache_size:
            try:
                model.set_cache(LlamaCache(capacity_bytes=request.cache_size))
                logger.info(f"Initialized LLM cache with {request.cache_size / (1024*1024*1024):.1f}GB capacity")
            except Exception as e:
                logger.warning(f"Failed to initialize cache: {e}")

        # llama.cpp includes its own tokenizer
        self.current_model = model
        self.current_tokenizer = model
        return model, model

    def _load_llamacpp_hf_model(self, request: ModelLoadRequest) -> Tuple[Any, Any]:
        """Load a llama.cpp model with HuggingFace tokenizer"""
        model = self._load_llamacpp_model(request)[0]
        tokenizer_path = request.tokenizer_path or (request.model_path if request.model_path else f"models/{request.model_name}")
        
        tokenizer = AutoTokenizer.from_pretrained(
            tokenizer_path,
            trust_remote_code=request.trust_remote_code,
            use_fast=request.use_fast_tokenizer,
        )

        self.current_model = model
        self.current_tokenizer = tokenizer
        return model, tokenizer

    def _load_exllamav2_model(self, request: ModelLoadRequest) -> Tuple[Any, Any]:
        """Load an ExLlamav2 model"""
        try:
            from exllamav2 import ExLlamaV2, ExLlamaV2Config, ExLlamaV2Cache, ExLlamaV2Tokenizer
        except ImportError:
            raise ImportError("exllamav2 is not installed. Please install it from the ExLlamaV2 repository")

        model_path = Path(request.model_path) if request.model_path else Path(f"models/{request.model_name}")
        if not model_path.exists():
            raise ValueError(f"Model path does not exist: {model_path}")

        config = ExLlamaV2Config()
        config.model_dir = str(model_path)
        config.max_seq_len = request.max_seq_len or 2048
        config.compress_pos_emb = request.compress_pos_emb
        config.alpha_value = request.alpha_value

        model = ExLlamaV2(config)
        model.load()

        tokenizer = ExLlamaV2Tokenizer(config)

        self.current_model = model
        self.current_tokenizer = tokenizer
        return model, tokenizer

    def _load_exllamav2_hf_model(self, request: ModelLoadRequest) -> Tuple[Any, Any]:
        """Load an ExLlamav2 model with HuggingFace tokenizer"""
        model = self._load_exllamav2_model(request)[0]
        tokenizer_path = request.tokenizer_path or (request.model_path if request.model_path else f"models/{request.model_name}")
        
        tokenizer = AutoTokenizer.from_pretrained(
            tokenizer_path,
            trust_remote_code=request.trust_remote_code,
            use_fast=request.use_fast_tokenizer,
        )

        self.current_model = model
        self.current_tokenizer = tokenizer
        return model, tokenizer

    def _load_hqq_model(self, request: ModelLoadRequest) -> Tuple[Any, Any]:
        """Load an HQQ model"""
        try:
            from hqq.core.quantize import HQQBackend, HQQLinear
            from hqq.models.hf.base import AutoHQQHFModel
            import requests
            from tqdm import tqdm
        except ImportError:
            raise ImportError("hqq is not installed. Please install it from the HQQ repository")

        model_path = Path(request.model_path) if request.model_path else Path(f"models/{request.model_name}")
        
        # Create models directory if it doesn't exist
        model_path.parent.mkdir(parents=True, exist_ok=True)
        logger.info(f"Using model path: {model_path}")

        # If it's a HuggingFace model ID and doesn't exist locally, try to download it
        if '/' in request.model_name and not model_path.exists():
            logger.info(f"Model not found locally at {model_path}, attempting to download: {request.model_name}")
            
            try:
                # Get the list of files in the repository using the raw API
                api_url = f"https://huggingface.co/api/models/{request.model_name}/tree/main"
                headers = {"Accept": "application/json"}
                if request.hf_token:
                    headers["Authorization"] = f"Bearer {request.hf_token}"
                    logger.info("Using provided HuggingFace token")
                
                logger.info(f"Fetching repository contents from {api_url}")
                response = requests.get(api_url, headers=headers)
                response.raise_for_status()
                files = response.json()
                logger.info(f"Found {len(files)} files in repository")
                
                # Required files for HQQ models
                required_files = ['qmodel.pt', 'config.json', 'tokenizer.model', 'tokenizer_config.json', 'tokenizer.json']
                logger.info(f"Required files: {required_files}")
                
                # Download each required file
                for file_name in required_files:
                    file_info = next((f for f in files if f['path'] == file_name), None)
                    if not file_info:
                        logger.error(f"Required file {file_name} not found in repository. Available files: {[f['path'] for f in files]}")
                        raise ValueError(f"Required file {file_name} not found in repository {request.model_name}")
                    
                    download_url = f"https://huggingface.co/{request.model_name}/resolve/main/{file_name}"
                    file_path = model_path / file_name
                    
                    # Download the file with progress bar
                    logger.info(f"Downloading {file_name} ({file_info.get('size', 'unknown size')}) from {download_url}")
                    response = requests.get(download_url, stream=True, headers=headers)
                    response.raise_for_status()
                    
                    total_size = int(response.headers.get('content-length', 0))
                    block_size = 8192  # 8 KB
                    
                    with open(file_path, 'wb') as f, tqdm(
                        desc=file_name,
                        total=total_size,
                        unit='iB',
                        unit_scale=True,
                        unit_divisor=1024,
                    ) as pbar:
                        for data in response.iter_content(block_size):
                            size = f.write(data)
                            pbar.update(size)
                    
                    logger.info(f"Successfully downloaded {file_name} to {file_path}")
                
            except Exception as e:
                logger.error(f"Failed to download model: {str(e)}", exc_info=True)
                # Clean up any partially downloaded files
                if model_path.exists():
                    import shutil
                    shutil.rmtree(model_path)
                raise ValueError(f"Failed to download model: {str(e)}")

        if not model_path.exists():
            logger.error(f"Model path does not exist after download attempt: {model_path}")
            raise ValueError(f"Model path does not exist: {model_path}")

        logger.info(f"Loading HQQ model from {model_path}")
        model = AutoHQQHFModel.from_quantized(str(model_path))
        logger.info("Model loaded successfully")

        logger.info(f"Setting HQQ backend to {request.hqq_backend}")
        HQQLinear.set_backend(getattr(HQQBackend, request.hqq_backend))
        logger.info("HQQ backend set successfully")

        logger.info("Loading tokenizer")
        tokenizer = AutoTokenizer.from_pretrained(
            request.tokenizer_path or model_path,
            trust_remote_code=request.trust_remote_code,
            use_fast=request.use_fast_tokenizer,
        )
        logger.info("Tokenizer loaded successfully")

        self.current_model = model
        self.current_tokenizer = tokenizer
        return model, tokenizer

    def _load_tensorrt_model(self, request: ModelLoadRequest) -> Tuple[Any, Any]:
        """Load a TensorRT-LLM model"""
        try:
            import tensorrt_llm
            from tensorrt_llm.runtime import ModelConfig, SamplingConfig
        except ImportError:
            raise ImportError("tensorrt-llm is not installed. Please install it from the TensorRT-LLM repository")

        engine_path = Path(request.engine_dir) if request.engine_dir else Path(f"models/{request.model_name}")
        if not engine_path.exists():
            raise ValueError(f"Engine path does not exist: {engine_path}")

        config = ModelConfig(
            engine_dir=str(engine_path),
            max_batch_size=request.max_batch_size,
            max_input_len=request.max_input_len,
            max_output_len=int(request.max_output_len) if request.max_output_len is not None else None,
        )

        model = tensorrt_llm.runtime.GenerationSession(config)

        tokenizer = AutoTokenizer.from_pretrained(
            request.tokenizer_path or str(engine_path),
            trust_remote_code=request.trust_remote_code,
            use_fast=request.use_fast_tokenizer,
        )

        self.current_model = model
        self.current_tokenizer = tokenizer
        return model, tokenizer


# Global model manager instance
model_manager = ModelManager() 