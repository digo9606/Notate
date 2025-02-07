from src.data.dataIntake.textSplitting import split_text
from src.data.dataIntake.loadFile import load_document
from src.endpoint.models import EmbeddingRequest
from src.vectorstorage.helpers.sanitizeCollectionName import sanitize_collection_name
from src.vectorstorage.vectorstore import get_vectorstore
from src.vectorstorage.embeddings import embed_chunk, chunk_list

import os
import multiprocessing
import concurrent.futures
import time
from typing import AsyncGenerator
from collections import deque
import logging

logger = logging.getLogger(__name__)


async def embed(data: EmbeddingRequest) -> AsyncGenerator[dict, None]:
    file_name = os.path.basename(data.file_path)
    try:
        yield {"status": "info", "message": f"Starting embedding process for file: {file_name}"}

        # Get file size
        file_size = os.path.getsize(data.file_path)
        if file_size > 25 * 1024 * 1024:  # If file is larger than 25MB
            yield {"status": "info", "message": f"Processing large file ({file_size / (1024*1024):.1f}MB). This may take longer."}

        text_output = await load_document(data.file_path)

        if text_output is None:
            raise Exception("Failed to load document")

        # Handle generator output from CSV loader
        if hasattr(text_output, '__iter__') and not isinstance(text_output, (str, list)):
            texts = []
            for item in text_output:
                if isinstance(item, dict) and "status" in item:
                    # Forward progress updates from CSV processing
                    yield item
                else:
                    texts = item
        else:
            yield {"status": "info", "message": "File loaded successfully"}

        # Check if file is CSV or PDF
        if file_name.lower().endswith('.csv'):
            texts = text_output  # CSV loader already returns list of documents
        elif file_name.lower().endswith('.pdf'):
            # PDF loader returns list of Documents, no need to split
            texts = text_output
        else:
            # Pass metadata to split_text if it exists
            texts = split_text(text_output, data.file_path,
                             data.metadata if hasattr(data, 'metadata') else None)

        if not texts:
            raise Exception("No text content extracted from file")

        yield {"status": "info", "message": f"Split text into {len(texts)} chunks"}

        collection_name = sanitize_collection_name(str(data.collection_name))
        vectordb = get_vectorstore(
            data.api_key, collection_name, data.is_local, data.local_embedding_model)
        if not vectordb:
            raise Exception("Failed to initialize vector database")

        # Adjust chunk size based on file size
        chunk_size = min(50, max(10, int(1000000 / file_size)))  # Dynamic chunk size
        chunks = list(chunk_list(texts, chunk_size))
        total_chunks = len(chunks)
        yield {"status": "info", "message": f"Split into {total_chunks} chunks of {chunk_size} documents each"}

        start_time = time.time()
        time_history = deque(maxlen=5)

        # Process chunks with reduced parallelism for large files
        num_cores = max(1, min(multiprocessing.cpu_count() - 1, 4))  # Use fewer cores for large files
        yield {"status": "info", "message": f"Using {num_cores} CPU cores for processing"}

        with concurrent.futures.ThreadPoolExecutor(max_workers=num_cores) as executor:
            futures = []
            for i, chunk in enumerate(chunks):
                chunk_arg = (vectordb, chunk, i + 1, total_chunks, start_time, time_history)
                future = executor.submit(embed_chunk, chunk_arg)
                futures.append(future)
                
                # Process results as they complete
                for completed in concurrent.futures.as_completed(futures):
                    try:
                        result = completed.result()
                        yield {"status": "progress", "data": result}
                    except Exception as e:
                        logger.error(f"Error processing chunk: {str(e)}")
                        yield {"status": "error", "message": f"Error processing chunk: {str(e)}"}
                
                futures = [f for f in futures if not f.done()]  # Clean up completed futures

        yield {"status": "success", "message": "Embedding completed successfully"}

    except Exception as e:
        error_msg = f"Error embedding file: {str(e)}"
        logger.error(error_msg)
        yield {"status": "error", "message": error_msg}
