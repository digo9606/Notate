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

        # For both llama.cpp and other models, use our TextGenerator
        tokenizer = model_manager.current_tokenizer
        device = model.device.type if hasattr(model, "device") else "cpu"
        
        # Initialize text generator
        generator = StreamIterator(model, tokenizer, device)
        
        # Set up stopping criteria
        stopping_criteria = [StopOnInterrupt()]
        
        # Set up callback for streaming
        generated_text = ""
        
        def stream_callback(new_text: str):
            nonlocal generated_text
            generated_text += new_text
            
            # Check for stop sequences
            should_stop = False
            if request.stop_sequences:
                for stop_seq in request.stop_sequences:
                    if stop_seq in generated_text:
                        should_stop = True
                        break
                        
            return should_stop

        # For llama.cpp models, we'll use their native completion method through our generator
        if model_manager.model_type == "llama.cpp":
            async def llama_generate(callback):
                try:
                    completion = model.create_completion(
                        prompt=request.prompt,
                        max_tokens=request.max_tokens,
                        temperature=request.temperature,
                        top_p=request.top_p,
                        top_k=request.top_k,
                        repeat_penalty=request.repetition_penalty,
                        stream=True
                    )
                    
                    for chunk in completion:
                        text = chunk["choices"][0]["text"]
                        callback(text)
                        if stream_callback(text):
                            break
                        # Add a small delay to prevent overwhelming the system
                        await asyncio.sleep(0.01)
                    
                    return generated_text
                except Exception as e:
                    logger.error(f"Error in llama_generate: {str(e)}")
                    raise

            # Create an async iterator that wraps the llama.cpp completion
            async def async_iterator():
                queue = asyncio.Queue()
                
                def callback(text):
                    asyncio.run_coroutine_threadsafe(queue.put(text), loop)
                
                loop = asyncio.get_event_loop()
                task = asyncio.create_task(llama_generate(callback))
                
                try:
                    while True:
                        try:
                            token = await queue.get()
                            yield token
                        except asyncio.CancelledError:
                            break
                finally:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            stream_iterator = async_iterator()
        else:
            # Start generation with streaming for other models
            stream_iterator = generator.generate(
                prompt=request.prompt,
                max_new_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                top_k=request.top_k,
                repetition_penalty=request.repetition_penalty,
                stopping_criteria=stopping_criteria,
                callback=stream_callback,
                stream=True
            )
        
        # Stream the tokens
        async for token in stream_iterator:
            response = {
                "id": f"chatcmpl-{uuid.uuid4()}",
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": model_manager.model_name,
                "choices": [{
                    "index": 0,
                    "delta": {
                        "content": token
                    },
                    "finish_reason": None
                }]
            }
            yield f"data: {json.dumps(response)}\n\n"
            
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
        system_message = next((message.content for message in request.messages if message.role == "system"), None)
        
        if system_message:
            formatted_prompt = f"<s>[INST] <<SYS>>\n{system_message}\n<</SYS>>\n\n"
        else:
            formatted_prompt = "<s>"
            
        # Process user and assistant messages
        for i, message in enumerate(request.messages):
            if message.role == "user":
                if i == 0 and not system_message:
                    formatted_prompt += f"[INST] {message.content} [/INST]"
                else:
                    formatted_prompt += f"</s><s>[INST] {message.content} [/INST]"
            elif message.role == "assistant":
                formatted_prompt += f" {message.content}"
                
        # Add final token if needed
        if formatted_prompt.endswith("[/INST]"):
            formatted_prompt += " "
        else:
            formatted_prompt += "</s>"

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

