from langchain_community.embeddings.huggingface import HuggingFaceEmbeddings
import logging
import torch
import os
from pathlib import Path

logger = logging.getLogger(__name__)

def get_models_dir():
    # On macOS, use ~/Library/Application Support/Notate/models
    if os.name == 'posix':
        base_dir = os.path.expanduser('~/Library/Application Support/Notate')
    else:
        # For other platforms, use appropriate app data directory
        base_dir = os.path.expanduser('~/.notate')
    
    models_dir = os.path.join(base_dir, 'models')
    os.makedirs(models_dir, exist_ok=True)
    return models_dir

async def init_store(model_name: str = "HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5"):
    logger.info("Initializing HuggingFace embeddings")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    models_dir = get_models_dir()
    logger.info(f"Using models directory: {models_dir}")

    model_kwargs = {
        "device": device
    }

    encode_kwargs = {
        "device": device,
        "normalize_embeddings": True,
        "max_seq_length": 512
    }

    return HuggingFaceEmbeddings(
        model_name=model_name,
        model_kwargs=model_kwargs,
        encode_kwargs=encode_kwargs,
        cache_folder=models_dir
    )
