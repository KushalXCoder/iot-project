import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env", override=True)


def required_env(name):
    value = os.getenv(name, "").strip()

    if not value:
        raise ValueError(f"Missing {name} in backend/.env")

    return value


ESP32_CAMERA_IP = required_env("ESP32_CAMERA_IP")
ESP32_CAMERA_PORT = int(os.getenv("ESP32_CAMERA_PORT", "81"))

ESP32_CAMERA_STREAM_URL = (
    f"http://{ESP32_CAMERA_IP}:{ESP32_CAMERA_PORT}/stream"
)

print(f"ESP32_CAMERA_STREAM_URL: {ESP32_CAMERA_STREAM_URL}")

ESP32_AUDIO_IP = required_env("ESP32_AUDIO_IP")
ESP32_AUDIO_PORT = int(os.getenv("ESP32_AUDIO_PORT", "50005"))

RECOGNITION_THRESHOLD = float(
    os.getenv("RECOGNITION_THRESHOLD", "0.40")
)