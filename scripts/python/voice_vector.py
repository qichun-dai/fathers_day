# Use a pretrained audio embedding model (torchaudio Wav2Vec2) on mp3 files in
# data/interim and save embeddings in data/processed/voice_vectors.csv.

import csv
import ssl
from pathlib import Path

import librosa
import numpy as np
import torch
import torchaudio
from torchaudio.pipelines import WAV2VEC2_BASE


def extract_speaker_embedding(file_path: Path, model, sample_rate_target: int) -> np.ndarray:
    # Load audio file as mono float waveform.
    waveform_np, sample_rate = librosa.load(str(file_path), sr=None, mono=True)
    waveform = torch.from_numpy(waveform_np).unsqueeze(0).float()

    # Resample to model sample rate if necessary.
    if sample_rate != sample_rate_target:
        resampler = torchaudio.transforms.Resample(sample_rate, sample_rate_target)
        waveform = resampler(waveform)

    # Extract high-level representation and mean-pool over time.
    with torch.inference_mode():
        features, _ = model.extract_features(waveform)
    embedding = features[-1].mean(dim=1).squeeze(0)
    return embedding.detach().cpu().numpy().astype(np.float64)


bundle = WAV2VEC2_BASE

try:
    model = bundle.get_model()
except Exception as exc:
    # Some corporate/managed Windows setups break TLS validation for model downloads.
    # Retry once with unverified SSL context so the pipeline can proceed.
    if "CERTIFICATE_VERIFY_FAILED" in str(exc):
        ssl._create_default_https_context = ssl._create_unverified_context
        model = bundle.get_model()
    else:
        raise

model.eval()
target_sample_rate = bundle.sample_rate
output_file = Path("data/processed/voice_vectors.csv")

rows = []
for file in Path("data/interim").glob("*.mp3"):
    voice_vector = extract_speaker_embedding(file, model, target_sample_rate)
    file_id = int(file.stem.split("_", 1)[0])
    voice_vector_str = " ".join(f"{value:.10f}" for value in voice_vector)
    rows.append([file_id, file.name, voice_vector_str])
rows.sort(key=lambda r: r[0])

with open(output_file, "w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["ID", "file_name", "vectors"])
    writer.writerows(rows)

        
        
