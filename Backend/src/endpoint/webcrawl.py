from src.data.dataIntake.fileTypes.loadX import load_html
from src.data.dataIntake.textSplitting import split_text
from src.data.dataIntake.getHtmlFiles import get_html_files
from src.data.dataFetch.webcrawler import WebCrawler
from src.endpoint.models import WebCrawlRequest
from src.vectorstorage.vectorstore import get_vectorstore

from typing import Generator
import json
import os
from urllib.parse import urlparse
import logging
import sys

def webcrawl(data: WebCrawlRequest, cancel_event=None) -> Generator[dict, None, None]:
    try:
        scraper = WebCrawler(
            data.base_url,
            data.user_id,
            data.user_name,
            data.collection_id,
            data.collection_name,
            max_workers=data.max_workers,
            cancel_event=cancel_event
        )

        for progress in scraper.scrape():
            if progress:
                try:
                    json_str = json.dumps(progress, ensure_ascii=False, errors='replace')
                    yield f"data: {json_str}\n\n"
                except Exception as e:
                    logging.error(f"Error serializing progress: {str(e)}")
                    continue

        root_url_dir = urlparse(data.base_url).netloc.replace(".", "_") + "_docs"
        collection_path = os.path.join(scraper.output_dir, root_url_dir)
        vector_store = get_vectorstore(
            data.api_key, data.collection_name, data.is_local, data.local_embedding_model)

        html_files = get_html_files(collection_path)
        logging.info(f"Found {len(html_files)} HTML files")

        batch_size = 50
        total_batches = (len(html_files) + batch_size - 1) // batch_size
        for i in range(0, len(html_files), batch_size):
            batch = html_files[i:i + batch_size]
            batch_docs = []

            for file_path in batch:
                content = load_html(file_path)
                if content:
                    split_content = split_text(content, file_path)
                    batch_docs.extend(split_content)

            if batch_docs:
                vector_store.add_documents(batch_docs)

            current_batch = i//batch_size + 1
            try:
                progress_data = {
                    "status": "progress",
                    "data": {
                        "message": f"Part 2 of 2: Processing documents batch {current_batch}/{total_batches}",
                        "chunk": current_batch,
                        "total_chunks": total_batches,
                        "percent_complete": f"{(current_batch/total_batches * 100):.1f}%"
                    }
                }
                json_str = json.dumps(progress_data, ensure_ascii=False, errors='replace')
                yield f"data: {json_str}\n\n"
            except Exception as e:
                logging.error(f"Error serializing batch progress: {str(e)}")
                continue

        try:
            final_message = f"Successfully crawled and embedded {len(scraper.visited_urls)} pages from {data.base_url}"
            success_data = {
                "status": "success",
                "data": {
                    "message": final_message
                }
            }
            json_str = json.dumps(success_data, ensure_ascii=False, errors='replace')
            yield f"data: {json_str}\n\n"
        except Exception as e:
            logging.error(f"Error serializing final message: {str(e)}")
    except Exception as e:
        error_message = str(e)
        logging.error(f"Error during webcrawl: {error_message}")
        try:
            error_data = {
                "status": "error",
                "data": {
                    "message": error_message
                }
            }
            json_str = json.dumps(error_data, ensure_ascii=False, errors='replace')
            yield f"data: {json_str}\n\n"
        except Exception as json_e:
            logging.error(f"Error serializing error message: {str(json_e)}")
