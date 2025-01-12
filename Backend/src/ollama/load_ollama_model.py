# Replace YOUR_HF_TOKEN with your HuggingFace token that has access to Meta models
curl -X POST "http://localhost:47372/load-model" \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "meta-llama/Llama-2-1b-hf",
  }'
  
  
  microsoft/phi-4
  
  
  curl -X POST "http://localhost:47372/load-model" -H "Content-Type: application/json" -d '{"model_name": "meta-llama/Llama-2-1b-hf", "model_type": "Transformers", "device": "cuda", "load_in_4bit": true, "use_flash_attention": true, "compute_dtype": "float16"}'