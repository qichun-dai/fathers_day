from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, List


def read_csv_rows(csv_path: Path) -> List[Dict[str, str]]:
    # utf-8-sig transparently handles files with or without a UTF-8 BOM.
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def extract_raw_graph(project_root: Path) -> Dict[str, List[Dict[str, str]]]:
    raw_dir = project_root / "data" / "raw"
    processed_dir = project_root / "data" / "processed"

    words = read_csv_rows(raw_dir / "dad_words.csv")
    voice_vectors = read_csv_rows(processed_dir / "voice_vectors.csv")
    distance_matrix = read_csv_rows(processed_dir / "distance_matrix.csv")

    return {
        "words": words,
        "voice_vectors": voice_vectors,
        "distance_matrix": distance_matrix,
    }
