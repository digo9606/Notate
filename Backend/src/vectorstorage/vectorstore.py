from src.vectorstorage.init_store import get_models_dir
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings
import torch
import os
import logging
import platform

logger = logging.getLogger(__name__)

def get_app_data_dir():
    home_dir = os.path.expanduser("~")
    if platform.system() == "Darwin":  # macOS
        app_data_dir = os.path.join(home_dir, "Library/Application Support/Notate")
    elif platform.system() == "Linux":  # Linux
        app_data_dir = os.path.join(home_dir, ".local/share/Notate")
    else:  # Windows and others
        app_data_dir = os.path.join(home_dir, ".notate")

    os.makedirs(app_data_dir, exist_ok=True)
    return app_data_dir

chroma_db_path = os.path.join(get_app_data_dir(), "chroma_db")
logger.info(f"Using Chroma DB path: {chroma_db_path}")

def get_vectorstore(api_key: str, collection_name: str, use_local_embeddings: bool = False, local_embedding_model: str = "HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5"):
    try:
        if use_local_embeddings or api_key is None:
            logger.info(f"Using local embedding model: {local_embedding_model}")
            
            # Determine the appropriate device
            if torch.cuda.is_available():
                device = "cuda"
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                device = "mps"
            else:
                device = "cpu"
                
            logger.info(f"Using device: {device}")
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

            try:
                embeddings = HuggingFaceEmbeddings(
                    model_name=local_embedding_model,
                    model_kwargs=model_kwargs,
                    encode_kwargs=encode_kwargs,
                    cache_folder=models_dir
                )
            except Exception as e:
                logger.error(f"Error initializing embeddings with {device}: {str(e)}")
                if device != "cpu":
                    logger.info("Falling back to CPU")
                    model_kwargs["device"] = "cpu"
                    encode_kwargs["device"] = "cpu"
                    embeddings = HuggingFaceEmbeddings(
                        model_name=local_embedding_model,
                        model_kwargs=model_kwargs,
                        encode_kwargs=encode_kwargs,
                        cache_folder=models_dir
                    )
                else:
                    raise
        else:
            logger.info("Using OpenAI embedding model")
            embeddings = OpenAIEmbeddings(api_key=api_key)

        vectorstore = Chroma(
            persist_directory=chroma_db_path,
            embedding_function=embeddings,
            collection_name=collection_name,
        )
        logger.info(f"Successfully initialized vectorstore for collection: {collection_name}")
        return vectorstore
    except Exception as e:
        logger.error(f"Error getting vectorstore: {str(e)}")
        return None
