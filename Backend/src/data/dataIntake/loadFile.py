import os
import logging

logger = logging.getLogger(__name__)

from src.data.dataIntake.fileTypes.loadX import (
    load_csv,
    load_docx,
    load_html,
    load_json,
    load_md,
    load_pptx,
    load_txt,
    load_xlsx,
    load_py,
    load_pdf,
)

file_handlers = {
    "pdf": load_pdf,
    "docx": load_docx,
    "txt": load_txt,
    "md": load_md,
    "html": load_html,
    "csv": load_csv,
    "json": load_json,
    "pptx": load_pptx,
    "xlsx": load_xlsx,
    "py": load_py,
}

async def load_document(file: str):
    try:
        file_type = file.split(".")[-1].lower()
        logger.info(f"Loading file of type: {file_type}")
        
        # Get file size
        file_size = os.path.getsize(file)
        logger.info(f"File size: {file_size / (1024*1024):.2f}MB")

        handler = file_handlers.get(file_type)
        print(handler)
        if not handler:
            logger.error(f"Unsupported file type: {file_type}")
            return None

        # Special handling for large PDFs
        if file_type == "pdf" and file_size > 25 * 1024 * 1024:  # 25MB
            logger.info("Large PDF detected - using chunked processing")
            return await handler(file, chunk_size=50)  # Process 50 pages at a time
        
        return await handler(file)

    except Exception as e:
        logger.error(f"Error loading file: {str(e)}")
        return None
