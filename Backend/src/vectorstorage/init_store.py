from langchain_community.embeddings.huggingface import HuggingFaceEmbeddings
import logging
import torch

logger = logging.getLogger(__name__)


async def init_store(model_name: str = "HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5"):
    logger.info(
        "Initializing HuggingFace embeddings")

    device = "mps" if torch.backends.mps.is_available() else "cpu"

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
        cache_folder="./models"
    )
