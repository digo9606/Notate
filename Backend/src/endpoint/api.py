from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from typing import AsyncGenerator
import json
import asyncio
from src.endpoint.models import GenerateRequest, ModelLoadRequest, ChatCompletionRequest
from transformers import TextIteratorStreamer
from threading import Thread
import logging
import os
from src.models.manager import model_manager
import uuid
import time

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

        # Handle Ollama models
        if model_manager.model_type == "ollama":
            import aiohttp
            
            # Prepare request data for Ollama API
            data = {
                "model": model["name"],
                "prompt": request.prompt,
                "stream": True,
                "options": {
                    "temperature": request.temperature,
                    "top_p": request.top_p,
                    "top_k": request.top_k,
                    "repeat_penalty": request.repetition_penalty,
                }
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post("http://localhost:11434/api/generate", json=data) as resp:
                    async for line in resp.content:
                        if line:
                            try:
                                chunk = json.loads(line)
                                if "error" in chunk:
                                    raise HTTPException(status_code=500, detail=chunk["error"])
                                    
                                response = {
                                    "id": f"chatcmpl-{uuid.uuid4()}",
                                    "object": "chat.completion.chunk",
                                    "created": int(time.time()),
                                    "model": model["name"],
                                    "choices": [{
                                        "index": 0,
                                        "delta": {
                                            "content": chunk.get("response", "")
                                        },
                                        "finish_reason": "stop" if chunk.get("done", False) else None
                                    }]
                                }
                                yield f"data: {json.dumps(response)}\n\n"
                                
                                if chunk.get("done", False):
                                    yield "data: [DONE]\n\n"
                                    break
                            except json.JSONDecodeError:
                                continue
            return

        # Handle llama.cpp models
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
                    "id": f"chatcmpl-{uuid.uuid4()}",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_manager.model_name,
                    "choices": [{
                        "index": 0,
                        "delta": {
                            "content": chunk["choices"][0]["text"]
                        },
                        "finish_reason": None
                    }]
                }
                yield f"data: {json.dumps(response)}\n\n"

            # Send final [DONE] message
            yield "data: [DONE]\n\n"
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
            "temperature": max(request.temperature, 1e-2),
            "top_p": min(max(request.top_p, 0.1), 0.95),
            "do_sample": True,
            "pad_token_id": tokenizer.pad_token_id,
            "eos_token_id": tokenizer.eos_token_id,
            "use_cache": True
        }

        # Apply stable generation settings for Apple Silicon or specific models
        if (hasattr(model, "device") and 
            (model.device.type == "mps" or "phi" in model_manager.model_name.lower())):
            # Force CPU for better stability
            model = model.to("cpu")
            inputs = {k: v.to("cpu") for k, v in inputs.items()}

            # Use more conservative generation config
            gen_config.update({
                "max_new_tokens": min(request.max_tokens, 256),  # Limit length
                "temperature": max(request.temperature, 0.7),    # Minimum temperature
                "top_k": 50,
                "top_p": 0.95,
                "num_beams": 1,                                 # Disable beam search
                "renormalize_logits": True,                     # Add logit renormalization
                "forced_decoder_ids": None,
                "remove_invalid_values": True,                  # Remove inf/nan
                "exponential_decay_length_penalty": (8, 1.2),   # Add length penalty
            })

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
                "id": f"chatcmpl-{uuid.uuid4()}",
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": model_manager.model_name,
                "choices": [{
                    "index": 0,
                    "delta": {
                        "content": new_text
                    },
                    "finish_reason": "stop" if should_stop else None
                }]
            }
            yield f"data: {json.dumps(response)}\n\n"

            if should_stop:
                break

            # Add a small delay to prevent overwhelming the client
            await asyncio.sleep(0.01)

        # Send final [DONE] message
        yield "data: [DONE]\n\n"

    except Exception as e:
        error_response = {
            "id": f"chatcmpl-{uuid.uuid4()}",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model_manager.model_name,
            "choices": [{
                "index": 0,
                "delta": {
                    "content": f"Error: {str(e)}"
                },
                "finish_reason": "error"
            }]
        }
        yield f"data: {json.dumps(error_response)}\n\n"
        yield "data: [DONE]\n\n"

async def chat_completion_stream(request: ChatCompletionRequest) -> AsyncGenerator[str, None]:
    """Generate streaming chat completion"""
    if not model_manager.is_model_loaded():
        raise HTTPException(
            status_code=400, detail="No model is currently loaded")

    try:
        model = model_manager.current_model

        # Format the messages according to the chat template
        formatted_prompt = ""
        for message in request.messages:
            if message.role == "user":
                formatted_prompt += f"<|user|>\n{message.content}</s>\n"
            elif message.role == "system":
                formatted_prompt += f"<|system|>\n{message.content}</s>\n"
            elif message.role == "assistant":
                formatted_prompt += f"<|assistant|>\n{message.content}</s>\n"
        
        formatted_prompt += "<|assistant|>"

        # Create a generate request from the chat request
        generate_request = GenerateRequest(
            prompt=formatted_prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            top_k=request.top_k,
            repetition_penalty=request.repetition_penalty,
            stop_sequences=request.stop if isinstance(request.stop, list) else [request.stop] if request.stop else None,
            stream=request.stream
        )

        # Use the existing generate_stream function
        async for chunk in generate_stream(generate_request):
            yield chunk

    except Exception as e:
        error_response = {
            "id": f"chatcmpl-{uuid.uuid4()}",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model_manager.model_name,
            "choices": [{
                "index": 0,
                "delta": {
                    "content": f"Error: {str(e)}"
                },
                "finish_reason": "error"
            }]
        }
        yield f"data: {json.dumps(error_response)}\n\n"
        yield "data: [DONE]\n\n"

