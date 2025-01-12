import torch
from src.endpoint.models import ModelLoadRequest


def get_device(request: ModelLoadRequest) -> str:
    if request.device != "auto":
        return request.device

    if torch.cuda.is_available():
        return "cuda"
    elif torch.backends.mps.is_available():
        return "mps"
    else:
        return "cpu"
