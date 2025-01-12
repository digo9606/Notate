from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from typing import AsyncGenerator
import json
import asyncio
from src.models.model_loader import model_manager
from src.endpoint.models import GenerateRequest, ModelLoadRequest
from transformers import TextIteratorStreamer
from threading import Thread
import logging
import os

# Configure logging
log_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "logs")
os.makedirs(log_dir, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(log_dir, 'app.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


async def generate_stream(request: GenerateRequest) -> AsyncGenerator[str, None]:
    """Generate text stream from the model"""
    if not model_manager.is_model_loaded():
        raise HTTPException(
            status_code=400, detail="No model is currently loaded")

    try:
        model = model_manager.current_model

        # Handle llama.cpp models differently
        if model_manager.model_type == "llama.cpp":
            # Use llama.cpp's native completion method
            completion = model.create_completion(
                prompt=request.prompt,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                top_k=request.top_k,
                repeat_penalty=request.repetition_penalty,
                stream=True
            )

            # Stream the output
            for chunk in completion:
                response = {
                    "text": chunk["choices"][0]["text"],
                    "stop": False
                }
                yield json.dumps(response) + "\n"

            return

        # For other model types, use the transformers pipeline
        tokenizer = model_manager.current_tokenizer

        # Encode the prompt
        inputs = tokenizer(request.prompt, return_tensors="pt",
                           add_special_tokens=True)
        if hasattr(model, "to"):
            inputs = {k: v.to(model.device) for k, v in inputs.items()}

        # Set up generation config with better numerical stability
        gen_config = {
            "max_new_tokens": request.max_tokens,
            # Small but non-zero temperature
            "temperature": max(request.temperature, 1e-2),
            "top_p": min(max(request.top_p, 0.1), 0.95),  # Conservative top_p
            "do_sample": True,
            "pad_token_id": tokenizer.pad_token_id,
            "eos_token_id": tokenizer.eos_token_id,
            "use_cache": True
        }

        # Add model-specific adjustments for Phi
        if "phi" in model_manager.model_name.lower():
            # Force CPU for Phi models and use stable generation settings
            model = model.to("cpu")
            inputs = {k: v.to("cpu") for k, v in inputs.items()}

            # Use minimal but stable generation config
            gen_config = {
                # Limit max tokens for stability
                "max_new_tokens": min(request.max_tokens, 256),
                "do_sample": True,
                "temperature": 1.0,  # Fixed temperature
                "top_k": 50,
                "top_p": 0.95,
                "num_beams": 1,  # Disable beam search
                "pad_token_id": tokenizer.pad_token_id,
                "eos_token_id": tokenizer.eos_token_id,
                "use_cache": True,
                "renormalize_logits": True,  # Add logit renormalization
                "forced_decoder_ids": None,
                "remove_invalid_values": True,  # Remove inf/nan
                # Add length penalty
                "exponential_decay_length_penalty": (8, 1.2),
            }

            # Remove MPS check since we're forcing CPU
            if False and model.device.type == "mps":
                model = model.to("cpu")
                inputs = {k: v.to("cpu") for k, v in inputs.items()}

        # Stream the output
        generated_text = ""
        streamer = TextIteratorStreamer(tokenizer, skip_special_tokens=True)
        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            **gen_config
        )

        # Create a thread to run the generation
        thread = Thread(target=model.generate, kwargs=generation_kwargs)
        thread.start()

        # Stream the output tokens
        for new_text in streamer:
            generated_text += new_text

            # Check for stop sequences
            should_stop = False
            if request.stop_sequences:
                for stop_seq in request.stop_sequences:
                    if stop_seq in generated_text:
                        should_stop = True
                        break

            response = {
                "text": new_text,
                "stop": should_stop
            }
            yield json.dumps(response) + "\n"

            if should_stop:
                break

            # Add a small delay to prevent overwhelming the client
            await asyncio.sleep(0.01)

    except Exception as e:
        error_response = {
            "error": str(e)
        }
        yield json.dumps(error_response) + "\n"
