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


def webcrawl(data: WebCrawlRequest, cancel_event=None) -> Generator[dict, None, None]:
    try:
        # Create web crawler instance with all required fields
        scraper = WebCrawler(
            data.base_url,
            data.user_id,
            data.user_name,
            data.collection_id,
            data.collection_name,
            max_workers=data.max_workers,
            cancel_event=cancel_event
        )

        # Yield progress updates during scraping
        for progress in scraper.scrape():
            if progress:
                yield f"data: {json.dumps(progress)}"

        # After scraping, process and embed all HTML files
        root_url_dir = urlparse(
            data.base_url).netloc.replace(".", "_") + "_docs"
        collection_path = os.path.join(scraper.output_dir, root_url_dir)
        vector_store = get_vectorstore(
            data.api_key, data.collection_name, data.is_local, data.local_embedding_model)

        # Get all HTML files recursively
        html_files = get_html_files(collection_path)
        print(f"Found {len(html_files)} HTML files")

        # Process files one at a time
        total_files = len(html_files)
        for i, file_path in enumerate(html_files):
            content = load_html(file_path)
            if content:
                split_content = split_text(content, file_path)
                if split_content:
                    vector_store.add_documents(split_content)

            # Update progress after each file
            current_file = i + 1
            progress_data = {
                "status": "progress",
                "data": {
                    "message": f"Part 2 of 2: Processing document {current_file}/{total_files}",
                    "chunk": current_file,
                    "total_chunks": total_files,
                    "percent_complete": f"{(current_file/total_files * 100):.1f}%"
                }
            }
            yield f"data: {json.dumps(progress_data)}"

        final_message = f"Successfully crawled and embedded {len(scraper.visited_urls)} pages from {data.base_url}"
        success_data = {
            "status": "success",
            "data": {
                "message": final_message
            }
        }
        yield f"data: {json.dumps(success_data)}"
    except Exception as e:
        error_message = str(e)
        print(f"Error during webcrawl: {error_message}")
        logging.error(f"Error during webcrawl: {error_message}")
        error_data = {
            "status": "error",
            "data": {
                "message": error_message
            }
        }
        yield f"data: {json.dumps(error_data)}"
