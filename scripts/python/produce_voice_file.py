## read dad_words.csv file and produce a voice file for each word
## use Google Cloud Text-to-Speech for controllable voices

import csv
import os
from pathlib import Path
import unicodedata

from dotenv import load_dotenv
from google.cloud import texttospeech


def to_gcp_language_code(lang, country_code):
    # gTTS-style tags in CSV (e.g. zh-cn, pt-br) are normalized to BCP-47.
    if "-" in lang:
        parts = lang.split("-", 1)
        return f"{parts[0].lower()}-{parts[1].upper()}"
    return f"{lang.lower()}-{country_code.upper()}"


def resolve_voice_name(language_code, row_voice_name, default_voice_name):
    # Prefer explicit row voice; otherwise use default only if it matches language.
    if row_voice_name:
        return row_voice_name
    if default_voice_name and default_voice_name.startswith(f"{language_code}-"):
        return default_voice_name
    return None


def normalize_text(value):
    if value is None:
        return ""
    return unicodedata.normalize("NFC", str(value)).strip()


def produce_voice_file(client, row, output_dir, default_voice_name=None):
    row_id = normalize_text(row["id"])
    word = normalize_text(row["word"])
    country_code = normalize_text(row["country_code"])
    lang = normalize_text(row["lang"])

    if not word:
        print(f"Skipping row {row_id}: empty word")
        return

    language_code = row.get("gcp_language_code") or to_gcp_language_code(lang, country_code)
    row_voice_name = row.get("gcp_voice_name")
    voice_name = resolve_voice_name(language_code, row_voice_name, default_voice_name)

    # use id, word and country code as the file name
    file_name = f"{row_id}_{word}_{country_code}.mp3"
    file_path = output_dir / file_name

    # check if the file already exists
    if file_path.exists():
        print(f"{file_name} already exists, skipping...")
        return

    print(f"Producing {file_name} ({language_code})...")
    try:
        synthesis_input = texttospeech.SynthesisInput(text=word)
        voice_kwargs = {
            "language_code": language_code,
            "ssml_gender": texttospeech.SsmlVoiceGender.FEMALE,
        }
        if voice_name:
            voice_kwargs["name"] = voice_name
        voice = texttospeech.VoiceSelectionParams(**voice_kwargs)
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
        )

        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        with open(file_path, "wb") as out:
            out.write(response.audio_content)
    except Exception as e:
        print(f"  Error producing {file_name}: {e}")
    
if __name__ == "__main__":
    # read dad_words.csv file
    BASE_DIR = Path(__file__).resolve().parents[2]   # project root
    CSV_PATH = BASE_DIR / "data" / "raw" / "dad_words.csv"
    OUTPUT_DIR = BASE_DIR / "data" / "interim"
    ENV_PATH = BASE_DIR / ".env"
    DEFAULT_KEY_PATH = BASE_DIR / "config" / "clean-vista-267919-eaeba8262992.json"
    DEFAULT_VOICE_NAME = os.getenv("GOOGLE_TTS_VOICE_NAME", "en-GB-Neural2-A")

    load_dotenv(ENV_PATH)

    # Re-read after .env is loaded so environment value is picked up.
    DEFAULT_VOICE_NAME = os.getenv("GOOGLE_TTS_VOICE_NAME", DEFAULT_VOICE_NAME)

    if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS") and DEFAULT_KEY_PATH.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(DEFAULT_KEY_PATH)
    
    # create output directory if it doesn't exist
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    client = texttospeech.TextToSpeechClient()
    
    with open(CSV_PATH, 'r', encoding='utf-8-sig', newline='') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            produce_voice_file(client, row, OUTPUT_DIR, DEFAULT_VOICE_NAME)
            
    

  