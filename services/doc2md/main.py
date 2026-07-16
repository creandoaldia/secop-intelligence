"""
main.py — doc2md-microservice FastAPI application.

Endpoints:
  POST /convert       — Convert a PDF from URL
  POST /convert-file  — Convert a PDF from direct upload (base64)
  GET  /health        — Health check

JD Fixes applied:
  - FIX 3: asyncio.wait_for timeout on convert + 504 Gateway Timeout
  - FIX 4: GET /health endpoint
  - FIX 7: Port 8001 (configured via uvicorn)
"""

import base64
import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from converter import (
    ConvertError,
    ConvertResult,
    CONVERT_TIMEOUT,
    convert_document,
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="doc2md-microservice",
    description="Converts SECOP procurement PDFs to LLM-optimized Markdown",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ConvertRequest(BaseModel):
    url: str = Field(..., description="URL of the PDF document to convert")
    timeout: Optional[int] = Field(
        default=CONVERT_TIMEOUT,
        description="Timeout in seconds (default: {})".format(CONVERT_TIMEOUT),
    )


class ConvertFileRequest(BaseModel):
    content: str = Field(..., description="Base64-encoded PDF content")
    filename: str = Field(default="document.pdf", description="Original filename")
    timeout: Optional[int] = Field(default=CONVERT_TIMEOUT)


class ConvertMetadata(BaseModel):
    engine: str
    fallback: str
    pages: int
    source: str


class ConvertResponse(BaseModel):
    markdown: str
    metadata: ConvertMetadata


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    status: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post(
    "/convert",
    response_model=ConvertResponse,
    responses={
        200: {"description": "Successful conversion"},
        413: {"model": ErrorResponse, "description": "File too large"},
        422: {"model": ErrorResponse, "description": "Document unreadable"},
        502: {"model": ErrorResponse, "description": "Download failed"},
        504: {"model": ErrorResponse, "description": "Conversion timeout"},
    },
)
async def convert(req: ConvertRequest):
    """Convert a PDF from a URL to Markdown.

    Downloads the PDF, runs the 3-level cascade
    (markitdown → pymupdf4llm → EasyOCR), and returns
    structured Markdown suitable for LLM ingestion.
    """
    try:
        result: ConvertResult = await convert_document(
            req.url,
            timeout=req.timeout or CONVERT_TIMEOUT,
        )
        return ConvertResponse(
            markdown=result.markdown,
            metadata=ConvertMetadata(
                engine=result.engine,
                fallback=result.fallback,
                pages=result.pages,
                source=result.source,
            ),
        )
    except ConvertError as ce:
        raise HTTPException(
            status_code=ce.status_code,
            detail=ErrorResponse(error=ce.message, detail=ce.detail).model_dump(),
        )


@app.post(
    "/convert-file",
    response_model=ConvertResponse,
    responses={
        200: {"description": "Successful conversion"},
        413: {"model": ErrorResponse, "description": "File too large"},
        422: {"model": ErrorResponse, "description": "Document unreadable"},
        504: {"model": ErrorResponse, "description": "Conversion timeout"},
    },
)
async def convert_file(req: ConvertFileRequest):
    """Convert a PDF from a base64 upload to Markdown.

    Same 3-level cascade as /convert, but accepts the file
    directly instead of downloading from a URL.
    """
    # Decode base64
    try:
        raw = base64.b64decode(req.content)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="Invalid base64 content",
                detail=str(exc),
            ).model_dump(),
        )

    # Size check
    max_size = 50 * 1024 * 1024
    if len(raw) > max_size:
        raise HTTPException(
            status_code=413,
            detail=ErrorResponse(
                error=f"File too large: {len(raw) // 1024 // 1024} MB",
                detail=f"Max allowed: {max_size // 1024 // 1024} MB",
            ).model_dump(),
        )

    # Write to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp_path = tmp.name
    try:
        tmp.write(raw)
        tmp.close()

        # Convert using the local file path
        # Re-use convert_document logic via a helper
        from converter import ConvertResult as CR

        # We need a local-file variant; reuse the cascade directly
        result = await _convert_local_file(tmp_path, req.filename)
        return ConvertResponse(
            markdown=result.markdown,
            metadata=ConvertMetadata(
                engine=result.engine,
                fallback=result.fallback,
                pages=result.pages,
                source=result.source,
            ),
        )
    except ConvertError as ce:
        raise HTTPException(
            status_code=ce.status_code,
            detail=ErrorResponse(error=ce.message, detail=ce.detail).model_dump(),
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint.

    Returns {"status": "ok"} when the service is running.
    """
    return HealthResponse(status="ok")


# ---------------------------------------------------------------------------
# Local file conversion helper
# ---------------------------------------------------------------------------


async def _convert_local_file(file_path: str, source_name: str) -> ConvertResult:
    """Convert a local PDF file to Markdown (used by /convert-file).

    Delegates to converter.convert_local_file() to avoid
    duplicating the cascade logic (DRY).
    """
    import asyncio
    from converter import (
        convert_local_file,
        ConvertError,
        CONVERT_TIMEOUT,
    )

    try:
        return await asyncio.wait_for(
            convert_local_file(file_path, source_name),
            timeout=CONVERT_TIMEOUT,
        )
    except asyncio.TimeoutError:
        raise ConvertError(
            f"Conversion timeout after {CONVERT_TIMEOUT}s",
            status_code=504,
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("DOC2MD_PORT", "8001"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level=os.environ.get("DOC2MD_LOG_LEVEL", "info"),
    )
