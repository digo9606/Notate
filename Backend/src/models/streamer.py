import traceback
from queue import Queue
from threading import Thread
from typing import Optional, Callable, Any, List
import torch

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

    def generate(self,
                prompt: str,
                max_new_tokens: int = 100,
                temperature: float = 0.7,
                top_p: float = 0.95,
                top_k: int = 50,
                repetition_penalty: float = 1.1,
                stopping_criteria: Optional[List[StreamingStoppingCriteria]] = None,
                callback: Optional[Callable[[str], Any]] = None,
                stream: bool = True) -> str:
        """
        Generate text from a prompt, optionally streaming the output.
        
        Args:
            prompt: The input prompt
            max_new_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            repetition_penalty: Penalty for repeating tokens
            stopping_criteria: List of stopping criteria
            callback: Function to call for each generated token when streaming
            stream: Whether to stream the output
        
        Returns:
            The generated text
        """
        inputs = self.tokenizer(prompt, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

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
                            # Handle single token output
                            token = output.item()
                            text = self.tokenizer.decode([token], skip_special_tokens=True)
                        else:
                            # Handle batch output
                            token = output.sequences[0, -1].item()
                            text = self.tokenizer.decode([token], skip_special_tokens=True)
                        
                        generated_text += text
                        callback(text)
                
                return generated_text

            return StreamIterator(_stream_tokens, callback=callback)
        else:
            # Non-streaming generation
            with torch.no_grad():
                output_ids = self.model.generate(
                    **inputs,
                    **gen_config,
                    stopping_criteria=stopping_criteria
                )
                return self.tokenizer.decode(output_ids[0], skip_special_tokens=True)

class StreamIterator:
    """
    Transforms a function that takes a callback into a lazy iterator (generator).
    This is particularly useful for streaming text generation where we want to
    yield tokens as they are generated.
    """

    def __init__(self, func, args=None, kwargs=None, callback=None):
        self.func = func
        self.callback = callback
        self.queue = Queue()
        self.sentinel = object()
        self.args = args or []
        self.kwargs = kwargs or {}
        self.stop_now = False

        def _callback(val):
            if self.stop_now:
                raise StopNowException
            self.queue.put(val)

        def task():
            try:
                ret = self.func(callback=_callback, *self.args, **self.kwargs)
            except StopNowException:
                pass
            except Exception:
                traceback.print_exc()

            self.queue.put(self.sentinel)
            if self.callback:
                self.callback(ret)

        self.thread = Thread(target=task)
        self.thread.start()

    def __iter__(self):
        return self

    def __next__(self):
        obj = self.queue.get(True, None)
        if obj is self.sentinel:
            raise StopIteration
        return obj

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop_now = True 