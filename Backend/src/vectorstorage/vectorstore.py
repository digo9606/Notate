from src.vectorstorage.init_store import get_models_dir
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
import torch
import os
import logging
import platform

home_dir = os.path.expanduser("~")
if platform.system() == "Darwin":  # macOS
    app_data_dir = os.path.join(home_dir, "Library/Application Support/Notate")
else:  # Linux and others
    app_data_dir = os.path.join(home_dir, ".notate")

os.makedirs(app_data_dir, exist_ok=True)
chroma_db_path = os.path.join(app_data_dir, "chroma_db")
logger = logging.getLogger(__name__)

logger.info(
    "Initializing HuggingFace embeddings")


def get_vectorstore(api_key: str, collection_name: str, use_local_embeddings: bool = False, local_embedding_model: str = "granite-embedding:278m"):
    try:
        if use_local_embeddings or api_key is None:
            print(f"Using local embedding model: {local_embedding_model}")
            # Determine the best available device
            device = "cuda" if torch.cuda.is_available(
            ) else "mps" if torch.backends.mps.is_available() else "cpu"
            models_dir = get_models_dir()
            logger.info(f"Using models directory: {models_dir}")
            logger.info(f"Using device: {device}")

            model_kwargs = {
                "device": device
            }

            encode_kwargs = {
                "device": device,
                "normalize_embeddings": True,
                "max_seq_length": 512
            }

            embeddings = HuggingFaceEmbeddings(
                model_name="HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5",
                model_kwargs=model_kwargs,
                encode_kwargs=encode_kwargs,
                cache_folder=models_dir
            )
        else:
            print(f"Using OpenAI embedding model")
            embeddings = OpenAIEmbeddings(api_key=api_key)

        return Chroma(
            persist_directory=chroma_db_path,
            embedding_function=embeddings,
            collection_name=collection_name,
        )
    except Exception as e:
        print(f"Error getting vectorstore: {str(e)}")
        return None
