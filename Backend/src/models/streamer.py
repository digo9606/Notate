import traceback
from queue import Queue
from threading import Thread
from typing import Optional, Callable, Any, List, Union, AsyncIterator, Iterator
import torch
import time
import asyncio
import json
import os
import logging

logger = logging.getLogger(__name__)

class StopNowException(Exception):
    pass

class StreamingStoppingCriteria:
    """Base class for stopping criteria during text generation"""
    def __init__(self):
        pass

    def __call__(self, input_ids, scores) -> bool:
        return False

class StopOnInterrupt(StreamingStoppingCriteria):
    """Stopping criteria that checks for interruption signals"""
    def __init__(self, stop_signal=None):
        super().__init__()
        self.stop_signal = stop_signal or (lambda: False)

    def __call__(self, input_ids, scores) -> bool:
        return self.stop_signal()

class StreamIterator(AsyncIterator[str], Iterator[str]):
    """
    Iterator that streams tokens as they are generated.
    Supports both sync and async iteration.
    """
    def __init__(self, func: Callable, callback: Optional[Callable] = None):
        self.func = func
        self.callback = callback
        self.queue = Queue()
        self.async_queue = asyncio.Queue()
        self.sentinel = object()
        self.stop_now = False
        self.thread = None
        self.task = None
        self.loop = asyncio.get_event_loop()

    def _queue_callback(self, data):
        """Callback that puts data into both queues"""
        if self.stop_now:
            raise StopNowException
        
        if data is None:
            self.queue.put(self.sentinel)
            # Use a synchronous queue for the sentinel
            self.async_queue.put_nowait(None)
            return

        if self.callback:
            self.callback(data)
            
        # Format data for SSE
        formatted_data = f"data: {json.dumps(data)}\n\n"
        self.queue.put(formatted_data)
        # Use synchronous queue operations
        self.async_queue.put_nowait(formatted_data)

    def _start_generation(self):
        """Start the generation in a separate thread if not already started"""
        if not self.thread:
            def task():
                try:
                    self.func(self._queue_callback)
                except StopNowException:
                    pass
                except Exception:
                    traceback.print_exc()
                finally:
                    self._queue_callback(None)

            self.thread = Thread(target=task)
            self.thread.start()

    def __iter__(self) -> Iterator[str]:
        self._start_generation()
        return self

    def __next__(self) -> str:
        if not self.thread:
            self._start_generation()
        
        item = self.queue.get()
        if item is self.sentinel:
            raise StopIteration
        return item

    def __aiter__(self):
        self._start_generation()
        return self

    async def __anext__(self) -> str:
        if not self.thread:
            self._start_generation()
        
        try:
            item = await self.async_queue.get()
            if item is None:
                raise StopAsyncIteration
            return item
        except Exception as e:
            if isinstance(e, StopAsyncIteration):
                raise
            raise StopAsyncIteration from e

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop_now = True

class TextGenerator:
    """
    A text generator that streams tokens as they are generated.
    Supports both streaming and non-streaming modes.
    """
    def __init__(self, model, tokenizer, device: str = "cpu"):
        self.model = model
        self.tokenizer = tokenizer
        self.device = device
        self.stop_signal = False
        
        # Log CUDA status if available
        if hasattr(torch.cuda, 'is_available') and torch.cuda.is_available():
            logger.info("CUDA is available in TextGenerator")
            logger.info(f"Model GPU layers: {getattr(self.model, 'n_gpu_layers', 'unknown')}")
            logger.info(f"CUDA Memory allocated: {torch.cuda.memory_allocated() / 1024**2:.2f}MB")
            logger.info(f"CUDA Memory reserved: {torch.cuda.memory_reserved() / 1024**2:.2f}MB")

    def _create_llama_completion(self, prompt: str, max_new_tokens: int, temperature: float,
                               top_p: float, top_k: int, repetition_penalty: float,
                               stream: bool = True):
        """Helper method to create llama.cpp completions"""
        # Log CUDA status before generation
        if hasattr(torch.cuda, 'is_available') and torch.cuda.is_available():
            logger.info(f"Pre-generation CUDA Memory: {torch.cuda.memory_allocated() / 1024**2:.2f}MB")
            logger.info(f"Using GPU layers: {getattr(self.model, 'n_gpu_layers', 'unknown')}")
            
        result = self.model.create_completion(
            prompt=prompt,
            max_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            repeat_penalty=repetition_penalty,
            stream=stream
        )
        
        # Log CUDA status after generation
        if hasattr(torch.cuda, 'is_available') and torch.cuda.is_available():
            logger.info(f"Post-generation CUDA Memory: {torch.cuda.memory_allocated() / 1024**2:.2f}MB")
            
        return result

    def generate(self,
                prompt: str,
                max_new_tokens: int = 100,
                temperature: float = 0.7,
                top_p: float = 0.95,
                top_k: int = 50,
                repetition_penalty: float = 1.1,
                stopping_criteria: Optional[List[StreamingStoppingCriteria]] = None,
                callback: Optional[Callable[[dict], Any]] = None,
                stream: bool = True) -> Union[str, Any]:
        """
        Generate text from a prompt, optionally streaming the output.
        """
        if hasattr(self.model, 'create_completion'):
            # This is a llama.cpp model
            if stream:
                def _stream_tokens(callback):
                    generated_text = ""
                    completion = self._create_llama_completion(
                        prompt=prompt,
                        max_new_tokens=max_new_tokens,
                        temperature=temperature,
                        top_p=top_p,
                        top_k=top_k,
                        repetition_penalty=repetition_penalty,
                        stream=True
                    )
                    
                    for chunk in completion:
                        text = chunk["choices"][0]["text"]
                        generated_text += text
                        response = {
                            "id": "chatcmpl-" + str(hash(generated_text))[-12:],
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": "local-model",
                            "choices": [{
                                "index": 0,
                                "delta": {
                                    "content": text
                                },
                                "finish_reason": None
                            }]
                        }
                        callback(response)
                    
                    # Send final [DONE] message
                    callback({
                        "id": "chatcmpl-" + str(hash(generated_text))[-12:],
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": "local-model",
                        "choices": [{
                            "index": 0,
                            "delta": {},
                            "finish_reason": "stop"
                        }]
                    })
                    
                    # Signal end of generation
                    callback(None)
                    return generated_text

                return StreamIterator(_stream_tokens, callback=callback)
            else:
                # Non-streaming for llama.cpp
                completion = self._create_llama_completion(
                    prompt=prompt,
                    max_new_tokens=max_new_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    repetition_penalty=repetition_penalty,
                    stream=False
                )
                return completion["choices"][0]["text"]
        else:
            # For other models, use the original generate implementation
            inputs = self.tokenizer(prompt, return_tensors="pt", padding=True).to(self.device)

            # Set up generation config
            gen_config = {
                "max_new_tokens": max_new_tokens,
                "temperature": max(temperature, 1e-2),
                "top_p": min(max(top_p, 0.1), 0.95),
                "top_k": top_k,
                "repetition_penalty": repetition_penalty,
                "do_sample": True,
                "pad_token_id": self.tokenizer.pad_token_id,
                "eos_token_id": self.tokenizer.eos_token_id,
                "use_cache": True
            }

            if stream and callback:
                def _stream_tokens(callback):
                    generated_text = ""
                    with torch.no_grad():
                        for output in self.model.generate(
                            **inputs,
                            **gen_config,
                            stopping_criteria=stopping_criteria,
                            return_dict_in_generate=True,
                            output_scores=True
                        ):
                            if isinstance(output, torch.Tensor):
                                token = output.item()
                                text = self.tokenizer.decode([token], skip_special_tokens=True)
                            else:
                                token = output.sequences[0, -1].item()
                                text = self.tokenizer.decode([token], skip_special_tokens=True)
                            
                            generated_text += text
                            response = {
                                "id": "chatcmpl-" + str(hash(generated_text))[-12:],
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": "local-model",
                                "choices": [{
                                    "index": 0,
                                    "delta": {
                                        "content": text
                                    },
                                    "finish_reason": None
                                }]
                            }
                            callback(response)
                    
                    # Send final [DONE] message
                    callback({
                        "id": "chatcmpl-" + str(hash(generated_text))[-12:],
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": "local-model",
                        "choices": [{
                            "index": 0,
                            "delta": {},
                            "finish_reason": "stop"
                        }]
                    })
                    
                    # Signal end of generation
                    callback(None)
                    return generated_text

                return StreamIterator(_stream_tokens, callback=callback)
            else:
                # Non-streaming generation
                with torch.no_grad():
                    output = self.model.generate(
                        **inputs,
                        **gen_config,
                        stopping_criteria=stopping_criteria,
                        return_dict_in_generate=True,
                        output_scores=True
                    )
                    return self.tokenizer.decode(output.sequences[0], skip_special_tokens=True)

# End of TextGenerator class - everything after this line should be removed 