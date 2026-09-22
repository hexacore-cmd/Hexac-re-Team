FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Runtime libraries required by PaddlePaddle/OpenMP and image/PDF processing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgomp1 \
        libglib2.0-0 \
        libgl1 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install -r requirements.txt \
    # Some PaddleOCR/PaddleX dependency combinations pull the unrelated
    # PyPI package named `fitz`, which shadows PyMuPDF's `fitz` module.
    && python -m pip uninstall -y fitz || true \
    && python -m pip install --force-reinstall --no-cache-dir PyMuPDF==1.25.5 \
    && python -c "import fitz; print('PyMuPDF import OK:', fitz.__doc__.splitlines()[0] if fitz.__doc__ else 'loaded')"

COPY app.py .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
