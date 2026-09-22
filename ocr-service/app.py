import os, re
from pathlib import Path
import base64
import tempfile
import shutil
from typing import Any

# PyMuPDF provides the `fitz` module used by PaddleOCR document processing.
# It is installed from requirements.txt as PyMuPDF.
try:
    import fitz  # noqa: F401
except ImportError:
    fitz = None
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Nidaan PaddleOCR Service", version="1.0")

class OCRRequest(BaseModel):
    file_path: str | None = None
    file_name: str | None = None
    file_base64: str | None = None

def parse_fields(text: str) -> dict[str, Any]:
    def find(pattern):
        match = re.search(pattern, text, flags=re.I | re.M)
        return match.group(1).strip(" :-") if match else None
    return {
        "patientName": find(r"(?:patient\s*name|name)\s*[:\-]\s*([^\n]+)"),
        "dateOfBirth": find(r"(?:date\s*of\s*birth|dob|birth\s*date)\s*[:\-]\s*([0-9./-]+)"),
        "gender": find(r"(?:gender|sex)\s*[:\-]\s*([A-Za-z]+)"),
        "abhaId": find(r"(?:abha(?:\s*id)?|health\s*id)\s*[:\-]\s*([0-9-]+)"),
        "mobile": find(r"(?:mobile|phone|contact)\s*[:\-]\s*([+0-9 ()-]{8,})"),
        "bloodGroup": find(r"(?:blood\s*group|blood)\s*[:\-]\s*([ABO]{1,2}\s*[+-])"),
    }

def _ocr_one(ocr, image_path: str) -> list[str]:
    result = ocr.ocr(image_path, cls=True)
    lines: list[str] = []
    for page in result or []:
        for item in page or []:
            try:
                text = item[1][0]
                if text:
                    lines.append(str(text))
            except (IndexError, TypeError, KeyError):
                continue
    return lines

def run_ocr(file_path: str) -> tuple[str, list[str]]:
    # Convert PDFs to images ourselves. This avoids PaddleOCR's internal PDF
    # loader path, which can raise misleading "Failed importing fitz" errors
    # even when PyMuPDF is installed correctly.
    from paddleocr import PaddleOCR
    ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    source = Path(file_path)
    image_paths: list[str] = []
    temp_dir = None
    try:
        if source.suffix.lower() == ".pdf":
            if fitz is None:
                raise RuntimeError("PyMuPDF is unavailable for PDF conversion")
            temp_dir = tempfile.mkdtemp(prefix="nidaan_pdf_")
            with fitz.open(str(source)) as pdf:
                for index, page in enumerate(pdf):
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image_path = Path(temp_dir) / f"page_{index + 1}.png"
                    pix.save(str(image_path))
                    image_paths.append(str(image_path))
        else:
            image_paths = [str(source)]
        lines: list[str] = []
        for image_path in image_paths:
            lines.extend(_ocr_one(ocr, image_path))
        return "\n".join(lines), lines
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)

@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "paddleocr",
        "pymupdfAvailable": fitz is not None,
    }

@app.post("/ocr")
def ocr_document(request: OCRRequest):
    temp_path = None
    if request.file_base64:
        suffix = Path(request.file_name or "document.png").suffix or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(base64.b64decode(request.file_base64))
            temp_path = temp.name
        path = Path(temp_path)
    else:
        path = Path(request.file_path or "")
    if not path.exists() or not path.is_file():
        return {"ok": False, "error": "Document content was not provided"}
    try:
        text, lines = run_ocr(str(path))
        return {
            "ok": True,
            "handwritingSupport": "limited",
            "handwritingNote": "Printed text is supported best. Handwritten text may be missed or misread and requires manual verification.",
            "ocr": {
                "engine": "PaddleOCR",
                "fileName": request.file_name or path.name,
                "rawText": text,
                "lines": lines,
                "fields": parse_fields(text),
            },
        }
    except Exception as exc:
        return {"ok": False, "error": f"PaddleOCR processing failed: {exc}"}
