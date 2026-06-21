from __future__ import annotations

import json
from pathlib import Path
import shutil

from extract import extract_raw_graph
from transform import build_graph_payload


def write_graph_payload(project_root: Path, payload: dict) -> None:
	output_paths = [
		project_root / "data" / "processed" / "graph.json",
		project_root / "public" / "data" / "graph.json",
	]

	for output_path in output_paths:
		output_path.parent.mkdir(parents=True, exist_ok=True)
		with output_path.open("w", encoding="utf-8") as file:
			json.dump(payload, file, ensure_ascii=False, indent=2)


def copy_audio_assets(project_root: Path) -> None:
	source_dir = project_root / "data" / "interim"
	target_dir = project_root / "public" / "audio"
	target_dir.mkdir(parents=True, exist_ok=True)

	for audio_file in source_dir.glob("*.mp3"):
		shutil.copy2(audio_file, target_dir / audio_file.name)


def main() -> None:
	project_root = Path(__file__).resolve().parents[2]
	raw_data = extract_raw_graph(project_root)
	payload = build_graph_payload(raw_data)
	write_graph_payload(project_root, payload)
	copy_audio_assets(project_root)


if __name__ == "__main__":
	main()



