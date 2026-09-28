"""Rasterize a PDF with PyMuPDF and report page geometry and ink coverage.

Usage: python pdf_pages.py <file.pdf> <out_dir> <prefix>
Prints one JSON object: {"count": n, "pages": [{"index", "width_pt", "height_pt", "png", "ink"}]}
"""
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF

A4_W, A4_H = 794, 1123


def main() -> None:
    pdf_path, out_dir, prefix = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        r = page.rect
        matrix = fitz.Matrix(A4_W / r.width, A4_H / r.height)
        pix = page.get_pixmap(matrix=matrix, alpha=False, colorspace=fitz.csGRAY)
        png = out_dir / f"{prefix}-{i + 1}.png"
        pix.save(str(png))
        samples = pix.samples  # bytes, 1 channel
        dark = sum(1 for b in samples if b < 200)
        pages.append({
            "index": i + 1,
            "width_pt": round(r.width, 2),
            "height_pt": round(r.height, 2),
            "png": str(png),
            "ink": round(dark / len(samples), 5),
        })
    print(json.dumps({"count": len(doc), "pages": pages}))


if __name__ == "__main__":
    main()
