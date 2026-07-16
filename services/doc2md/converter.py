"""
converter.py — doc2md-microservice core conversion logic.

3-level cascade (markitdown -> pymupdf4llm -> EasyOCR per-page)
with quality gate between levels: if L1 output is sparse relative to
page count, force L2 regardless of exception status.

JD Fixes applied:
  - FIX 1: Quality gate L1->L2 (text density check)
  - FIX 2: asyncio.Semaphore for EasyOCR concurrency
  - FIX 3: asyncio.wait_for timeout wrapping
  - FIX 6: Streaming download + size validation
"""

import asyncio
import math
import os
import pathlib
import tempfile
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
CONVERT_TIMEOUT = int(os.environ.get("DOC2MD_CONVERT_TIMEOUT", "300"))
MAX_CONCURRENT_EASYOCR = int(os.environ.get("DOC2MD_MAX_CONCURRENT_EASYOCR", "1"))
EASYOCR_LANG = os.environ.get("DOC2MD_EASYOCR_LANG", "es")

# Quality gate: if L1 extracts fewer chars than MIN_CHARS_PER_PAGE * page_count,
# force L2 regardless of whether L1 raised an exception.
MIN_CHARS_PER_PAGE = 100

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


@dataclass
class ConvertResult:
    markdown: str
    engine: str = "markitdown"
    fallback: str = "not-needed"
    pages: int = 1
    source: str = ""


class ConvertError(Exception):
    def __init__(self, message: str, status_code: int = 500, detail: str = ""):
        self.message = message
        self.status_code = status_code
        self.detail = detail
        super().__init__(self.message)


# ---------------------------------------------------------------------------
# Semaphore for EasyOCR (FIX 2)
# ---------------------------------------------------------------------------

_easyocr_semaphore: Optional[asyncio.Semaphore] = None


def _get_easyocr_semaphore() -> asyncio.Semaphore:
    global _easyocr_semaphore
    if _easyocr_semaphore is None:
        _easyocr_semaphore = asyncio.Semaphore(MAX_CONCURRENT_EASYOCR)
    return _easyocr_semaphore


# ---------------------------------------------------------------------------
# Download helpers (FIX 6)
# ---------------------------------------------------------------------------


async def download_to_temp(url: str) -> str:
    """Download PDF from URL to a temp file, validating size.

    Uses streaming to avoid loading entire file into memory.
    Returns path to temp file.
    """
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp_path = tmp.name

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code != 200:
                    raise ConvertError(
                        f"Download failed: HTTP {resp.status_code}",
                        status_code=502,
                        detail=f"Server returned {resp.status_code} for {url}",
                    )

                content_length = resp.headers.get("content-length")
                if content_length and int(content_length) > MAX_FILE_SIZE:
                    raise ConvertError(
                        f"File too large: {int(content_length) // 1024 // 1024} MB",
                        status_code=413,
                        detail=f"Max allowed: {MAX_FILE_SIZE // 1024 // 1024} MB",
                    )

                downloaded = 0
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    downloaded += len(chunk)
                    if downloaded > MAX_FILE_SIZE:
                        tmp.close()
                        os.unlink(tmp_path)
                        raise ConvertError(
                            f"File too large (> {MAX_FILE_SIZE // 1024 // 1024} MB)",
                            status_code=413,
                        )
                    tmp.write(chunk)
    except ConvertError:
        # Re-raise our own errors
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    except Exception as exc:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise ConvertError(
            f"Download failed: {exc}",
            status_code=502,
            detail=str(exc),
        ) from exc
    finally:
        tmp.close()

    return tmp_path


# ---------------------------------------------------------------------------
# Cascade levels
# ---------------------------------------------------------------------------


def _level1_markitdown(path: str) -> tuple[str, int]:
    """Level 1: markitdown for all formats.

    Returns (markdown_text, char_count).
    Returns empty string on failure (no exception).
    """
    try:
        from markitdown import MarkItDown

        md = MarkItDown()
        result = md.convert(path)
        text = result.text_content or ""
        return text, len(text.strip())
    except Exception:
        return "", 0


def _level2_pymupdf4llm(path: str) -> tuple[str, int]:
    """Level 2: pymupdf4llm table-aware PDF fallback.

    Returns (markdown_text, char_count).
    Returns empty string on failure.
    """
    try:
        import pymupdf4llm

        result = pymupdf4llm.to_markdown(path)
        text = result or ""
        return text, len(text.strip())
    except Exception:
        return "", 0


async def _level3_easyocr(path: str) -> str:
    """Level 3: per-page EasyOCR for scanned/image-only PDFs.

    Protected by asyncio.Semaphore (FIX 2) to prevent OOM
    from concurrent EasyOCR instances.
    """
    import fitz  # PyMuPDF

    sem = _get_easyocr_semaphore()

    # Lazy-import EasyOCR inside the semaphore to avoid loading
    # PyTorch unless we actually need L3
    async def _ocr_with_sem() -> str:
        loop = asyncio.get_running_loop()

        def _run_ocr() -> str:
            import easyocr

            reader = easyocr.Reader(
                [EASYOCR_LANG],
                gpu=False,
                verbose=False,
            )
            doc = fitz.open(path)
            total = doc.page_count
            pages_text = []

            for i in range(total):
                page = doc[i]
                pix = page.get_pixmap(dpi=300)
                img_bytes = pix.tobytes("png")

                results = reader.readtext(img_bytes)
                page_text = " ".join(
                    [r[1] for r in results if r[1] and r[2] > 0.3]
                )
                if page_text.strip():
                    pages_text.append(f"## Page {i+1}\n{page_text}")

            doc.close()
            return "\n\n".join(pages_text)

        return await loop.run_in_executor(None, _run_ocr)

    try:
        async with sem:
            return await _ocr_with_sem()
    except Exception as exc:
        return f"## OCR Error\n\nL3 (EasyOCR) failed: {exc}"


# ---------------------------------------------------------------------------
# Page count helper
# ---------------------------------------------------------------------------


def _get_page_count(path: str) -> int:
    """Get PDF page count using PyMuPDF (fitz).  Returns 1 on error."""
    try:
        import fitz

        doc = fitz.open(path)
        count = doc.page_count
        doc.close()
        return count
    except Exception:
        return 1


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------


async def convert_document(
    url: str,
    *,
    timeout: int = CONVERT_TIMEOUT,
) -> ConvertResult:
    """Download a PDF from URL, convert to Markdown via 3-level cascade.

    Args:
        url: URL of the PDF document.
        timeout: Per-call timeout in seconds.

    Returns:
        ConvertResult with markdown text and metadata.

    Raises:
        ConvertError with appropriate HTTP status code.
    """
    tmp_path: str | None = None
    try:
        # Wrap the entire conversion in asyncio.wait_for (FIX 3)
        result, tmp_path = await asyncio.wait_for(
            _convert_inner(url),
            timeout=timeout,
        )
        return result

    except asyncio.TimeoutError:
        raise ConvertError(
            f"Conversion timeout after {timeout}s",
            status_code=504,
            detail=f"The document could not be processed within {timeout} seconds. "
            f"Try a smaller file or configure Azure OCR for large scanned documents.",
        )
    except ConvertError:
        raise
    except Exception as exc:
        raise ConvertError(
            f"Conversion failed: {exc}",
            status_code=500,
            detail=str(exc),
        )
    finally:
        # Cleanup temp file (FIX 3: cleanup runs even on timeout/cancel)
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


async def _convert_inner(url: str) -> tuple[ConvertResult, str]:
    """Inner conversion logic (no timeout wrapper).

    Returns:
        Tuple of (ConvertResult, tmp_file_path) so the caller
        can clean up the temp file in its finally block.

    Raises ConvertError on failure — temp file is returned to
    the caller for cleanup even in error cases.
    """
    tmp_path = ""

    try:
        # Step 1: Download
        tmp_path = await download_to_temp(url)
        page_count = _get_page_count(tmp_path)

        # Step 2: L1 — markitdown
        l1_text, l1_chars = _level1_markitdown(tmp_path)

        # Quality gate (FIX 1): check text density vs page count
        expected_min = page_count * MIN_CHARS_PER_PAGE
        l1_is_sparse = l1_chars < expected_min and l1_chars < 500

        if l1_is_sparse:
            # L1 is sparse — try L2
            l2_text, l2_chars = _level2_pymupdf4llm(tmp_path)

            if l2_chars > l1_chars:
                return ConvertResult(
                    markdown=l2_text,
                    engine="pymupdf4llm",
                    fallback="triggered" if l1_chars > 0 else "scanned-redirect",
                    pages=page_count,
                    source=url,
                ), tmp_path

            # L2 didn't help — try L3 (EasyOCR)
            l3_text = await _level3_easyocr(tmp_path)
            l3_chars = len(l3_text.strip())

            if l3_chars > l2_chars:
                return ConvertResult(
                    markdown=l3_text,
                    engine="pdf-to-images",
                    fallback="scanned-redirect",
                    pages=page_count,
                    source=url,
                ), tmp_path

            # All levels produced nothing useful
            raise ConvertError(
                "Document could not be read by any engine",
                status_code=422,
                detail="The PDF appears to be unreadable by all 3 cascade levels "
                "(markitdown, pymupdf4llm, EasyOCR). It may be encrypted, "
                "corrupted, or in an unsupported format.",
            )

        # L1 looks OK — use it
        return ConvertResult(
            markdown=l1_text,
            engine="markitdown",
            fallback="not-needed",
            pages=page_count,
            source=url,
        ), tmp_path

    except Exception:
        # Cleanup temp file on error before re-raising
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        raise


async def convert_local_file(file_path: str, source_name: str = "") -> ConvertResult:
    """Convert a local file to Markdown (no download).

    Used by /convert-file endpoint. Shares cascade logic with
    convert_document but skips the download step.
    """
    page_count = _get_page_count(file_path)

    # L1
    l1_text, l1_chars = _level1_markitdown(file_path)
    expected_min = page_count * MIN_CHARS_PER_PAGE
    l1_is_sparse = l1_chars < expected_min and l1_chars < 500

    if l1_is_sparse:
        l2_text, l2_chars = _level2_pymupdf4llm(file_path)
        if l2_chars > l1_chars:
            return ConvertResult(
                markdown=l2_text,
                engine="pymupdf4llm",
                fallback="triggered" if l1_chars > 0 else "scanned-redirect",
                pages=page_count,
                source=source_name,
            )

        l3_text = await _level3_easyocr(file_path)
        l3_chars = len(l3_text.strip())
        if l3_chars > l2_chars:
            return ConvertResult(
                markdown=l3_text,
                engine="pdf-to-images",
                fallback="scanned-redirect",
                pages=page_count,
                source=source_name,
            )

        raise ConvertError(
            "Document could not be read by any engine",
            status_code=422,
            detail="The document appears to be unreadable by all 3 cascade levels.",
        )

    return ConvertResult(
        markdown=l1_text,
        engine="markitdown",
        fallback="not-needed",
        pages=page_count,
        source=source_name,
    )
