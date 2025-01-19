import os
import torch
from transformers import AutoModel, AutoTokenizer
from sklearn.preprocessing import normalize
import logging

logger = logging.getLogger(__name__)


async def init_store():
    model_name = "dunzhang/stella_en_400M_v5"
    vector_dim = 1024

    # Set up model directory
    cache_dir = os.path.join(os.path.dirname(
        os.path.dirname(os.path.dirname(__file__))), "models")
    os.makedirs(cache_dir, exist_ok=True)
    logger.info(f"Using cache directory: {cache_dir}")

    # Initialize model without memory efficient attention
    logger.info(f"Downloading/loading model {model_name}")
    model = AutoModel.from_pretrained(
        model_name,
        trust_remote_code=True,
        use_memory_efficient_attention=False,
        unpad_inputs=False,
        cache_dir=cache_dir
    )

    if torch.backends.mps.is_available():
        device = torch.device("mps")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
    else:
        device = torch.device("cpu")

    logger.info(f"Using device: {device}")
    model = model.to(device)
    model.eval()

    # Initialize tokenizer
    logger.info("Initializing tokenizer")
    tokenizer = AutoTokenizer.from_pretrained(
        model_name, trust_remote_code=True, cache_dir=cache_dir)

    # Initialize vector linear layer
    logger.info("Setting up vector linear layer")
    vector_linear = torch.nn.Linear(
        in_features=model.config.hidden_size, out_features=vector_dim)
    vector_linear = vector_linear.to(device)

    return model, tokenizer, vector_linear
