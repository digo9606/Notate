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
from src.models.streamer import TextGenerator, StopOnInterrupt, StreamIterator
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
        generator = TextGenerator(model, model_manager.current_tokenizer, model_manager.device)

        # Set up stopping criteria
        stopping_criteria = [StopOnInterrupt()]

        if request.stream:
            stream_iterator = generator.generate(
                prompt=request.prompt,
                max_new_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                top_k=request.top_k,
                repetition_penalty=request.repetition_penalty,
                stopping_criteria=stopping_criteria,
                stream=True
            )

            async for chunk in stream_iterator:
                yield chunk

        else:
            # Non-streaming response
            response = generator.generate(
                prompt=request.prompt,
                max_new_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                top_k=request.top_k,
                repetition_penalty=request.repetition_penalty,
                stopping_criteria=stopping_criteria,
                stream=False
            )
            yield f"data: {json.dumps(response)}\n\n"
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
    """Stream chat completion from the model"""
    try:
        model = model_manager.current_model
        if not model:
            yield f"data: {json.dumps({'error': 'No model loaded'})}\n\n"
            return

        # Convert messages to prompt
        prompt = ""
        for msg in request.messages:
            if msg.role == "system":
                prompt += f"System: {msg.content}\n"
            elif msg.role == "user":
                prompt += f"User: {msg.content}\n"
            elif msg.role == "assistant":
                prompt += f"Assistant: {msg.content}\n"
        prompt += "Assistant: "

        # Create text generator
        generator = TextGenerator(model, model_manager.current_tokenizer, model_manager.device)

        if request.stream:
            stream_iterator = generator.generate(
                prompt=prompt,
                max_new_tokens=request.max_tokens or 2048,
                temperature=request.temperature or 0.7,
                top_p=request.top_p or 0.95,
                top_k=request.top_k or 50,
                repetition_penalty=1.1,
                stream=True
            )

            async for chunk in stream_iterator:
                yield chunk

        else:
            # Non-streaming response in OpenAI format
            response = generator.generate(
                prompt=prompt,
                max_new_tokens=request.max_tokens or 2048,
                temperature=request.temperature or 0.7,
                top_p=request.top_p or 0.95,
                top_k=request.top_k or 50,
                repetition_penalty=1.1,
                stream=False
            )
            
            # Format response exactly like OpenAI
            formatted_response = {
                "id": f"chatcmpl-{str(hash(response))[-12:]}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": "local-model",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": len(prompt),
                    "completion_tokens": len(response),
                    "total_tokens": len(prompt) + len(response)
                }
            }
            yield f"data: {json.dumps(formatted_response)}\n\n"

    except Exception as e:
        error_response = {
            "id": f"chatcmpl-{uuid.uuid4()}",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": "local-model",
            "choices": [{
                "index": 0,
                "delta": {
                    "content": f"Error: {str(e)}"
                },
                "finish_reason": "error"
            }]
        }
        yield f"data: {json.dumps(error_response)}\n\n"

