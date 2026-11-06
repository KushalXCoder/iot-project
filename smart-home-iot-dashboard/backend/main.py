import os
import time
import logging
from pathlib import Path
from typing import Generator, List

import cv2
import numpy as np
import requests

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException
)
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from database import (
    initialize_database,
    create_person,
    get_people,
    get_all_face_samples,
    delete_person
)

from face_engine import (
    extract_face_embedding,
    extract_embedding_from_face,
    normalize_embedding
)


# --------------------------------------------------
# Configuration
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

ESP32_STREAM_URL = os.getenv(
    "ESP32_STREAM_URL",
    "http://10.252.199.89:81/stream"
)

MODEL_PATH = (
    BASE_DIR
    / "models"
    / "face_detection_yunet_2023mar.onnx"
)

SCORE_THRESHOLD = 0.65
NMS_THRESHOLD = 0.30
TOP_K = 5000
MAX_FRAME_WIDTH = 640

# Initial cosine similarity threshold.
# Calibrate this with real camera images before relying on it.
RECOGNITION_THRESHOLD = float(
    os.getenv("RECOGNITION_THRESHOLD", "0.40")
)

# Refresh the in-memory face gallery periodically so additions
# and deletions from the People page are reflected.
GALLERY_REFRESH_SECONDS = 3.0

camera_connected = False
last_frame_time = None
total_faces_detected = 0
last_recognition_results = []

_gallery_cache = {}
_gallery_last_loaded = 0.0

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("haven")


# --------------------------------------------------
# FastAPI application
# --------------------------------------------------

app = FastAPI(
    title="Haven Face Recognition API",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Initialize SQLite database
# --------------------------------------------------

initialize_database()
logger.info("Haven SQLite database initialized.")


# --------------------------------------------------
# Load YuNet live detector
# --------------------------------------------------

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"YuNet model not found: {MODEL_PATH}"
    )

detector = cv2.FaceDetectorYN.create(
    str(MODEL_PATH),
    "",
    (320, 320),
    SCORE_THRESHOLD,
    NMS_THRESHOLD,
    TOP_K,
    cv2.dnn.DNN_BACKEND_OPENCV,
    cv2.dnn.DNN_TARGET_CPU
)

logger.info("YuNet live face detector loaded successfully.")
logger.info("SFace recognizer loaded successfully.")
logger.info(
    "Recognition cosine threshold: %.3f",
    RECOGNITION_THRESHOLD
)


# --------------------------------------------------
# Build an in-memory gallery from SQLite embeddings
# --------------------------------------------------

def load_face_gallery(force=False):
    """
    Build one normalized prototype embedding per person.

    Each enrolled sample is normalized first. Samples belonging
    to the same person are averaged, then the average is normalized.
    """
    global _gallery_cache, _gallery_last_loaded

    now = time.monotonic()

    if (
        not force
        and _gallery_cache
        and now - _gallery_last_loaded < GALLERY_REFRESH_SECONDS
    ):
        return _gallery_cache

    rows = get_all_face_samples()
    grouped = {}

    for row in rows:
        try:
            vector = np.frombuffer(
                row["embedding"],
                dtype=np.float32
            ).copy()

            if vector.size != 128:
                logger.warning(
                    "Skipping invalid embedding for person ID %s: size=%s",
                    row["person_id"],
                    vector.size
                )
                continue

            vector = normalize_embedding(vector)

            person_id = row["person_id"]

            if person_id not in grouped:
                grouped[person_id] = {
                    "name": row["person_name"],
                    "vectors": []
                }

            grouped[person_id]["vectors"].append(vector)

        except Exception:
            logger.exception(
                "Could not load an embedding for person ID %s",
                row.get("person_id")
            )

    gallery = {}

    for person_id, data in grouped.items():
        if not data["vectors"]:
            continue

        mean_vector = np.mean(
            np.stack(data["vectors"], axis=0),
            axis=0
        )

        try:
            prototype = normalize_embedding(mean_vector)
        except ValueError:
            continue

        gallery[person_id] = {
            "name": data["name"],
            "embedding": prototype,
            "sample_count": len(data["vectors"])
        }

    _gallery_cache = gallery
    _gallery_last_loaded = now

    logger.info(
        "Face gallery refreshed: %s enrolled identities",
        len(gallery)
    )

    return _gallery_cache


def recognize_embedding(query_embedding):
    """
    Compare one normalized face embedding with each enrolled
    person's prototype using cosine similarity.
    """
    gallery = load_face_gallery()

    if not gallery:
        return {
            "name": "Unknown",
            "person_id": None,
            "similarity": 0.0,
            "recognized": False
        }

    query = normalize_embedding(query_embedding)

    best_person = None
    best_similarity = -1.0

    for person_id, person in gallery.items():
        similarity = float(
            np.dot(query, person["embedding"])
        )

        if similarity > best_similarity:
            best_similarity = similarity
            best_person = {
                "person_id": person_id,
                "name": person["name"]
            }

    if (
        best_person is not None
        and best_similarity >= RECOGNITION_THRESHOLD
    ):
        return {
            "name": best_person["name"],
            "person_id": best_person["person_id"],
            "similarity": best_similarity,
            "recognized": True
        }

    return {
        "name": "Unknown",
        "person_id": None,
        "similarity": max(best_similarity, 0.0),
        "recognized": False
    }


# --------------------------------------------------
# Read JPEG frames from ESP32 MJPEG stream
# --------------------------------------------------

def read_esp32_frames() -> Generator[np.ndarray, None, None]:
    """
    Connect to the ESP32 MJPEG stream and extract JPEG frames.
    """

    global camera_connected

    buffer = bytearray()

    while True:
        try:
            logger.info(
                "Connecting to ESP32 stream: %s",
                ESP32_STREAM_URL
            )

            with requests.get(
                ESP32_STREAM_URL,
                stream=True,
                timeout=(5, 20)
            ) as response:

                response.raise_for_status()

                camera_connected = True
                logger.info("ESP32 camera connected.")

                for chunk in response.iter_content(
                    chunk_size=4096
                ):
                    if not chunk:
                        continue

                    buffer.extend(chunk)

                    start = buffer.find(b"\xff\xd8")

                    if start == -1:
                        if len(buffer) > 2:
                            del buffer[:-2]
                        continue

                    if start > 0:
                        del buffer[:start]

                    end = buffer.find(b"\xff\xd9", 2)

                    if end == -1:
                        if len(buffer) > 5_000_000:
                            buffer.clear()
                        continue

                    jpeg_bytes = bytes(buffer[:end + 2])
                    del buffer[:end + 2]

                    frame_array = np.frombuffer(
                        jpeg_bytes,
                        dtype=np.uint8
                    )

                    frame = cv2.imdecode(
                        frame_array,
                        cv2.IMREAD_COLOR
                    )

                    if frame is not None:
                        yield frame

        except requests.RequestException as error:
            camera_connected = False
            logger.error("ESP32 connection error: %s", error)

        except Exception:
            camera_connected = False
            logger.exception("Unexpected camera stream error.")

        camera_connected = False
        logger.warning("Reconnecting to ESP32 in 2 seconds.")
        time.sleep(2)


# --------------------------------------------------
# Live face detection and identity recognition
# --------------------------------------------------

def detect_faces(frame: np.ndarray) -> np.ndarray:
    """
    Detect faces, extract SFace embeddings, compare them with
    the enrolled gallery, and annotate the frame.
    """

    global total_faces_detected
    global last_recognition_results

    height, width = frame.shape[:2]

    if width > MAX_FRAME_WIDTH:
        scale = MAX_FRAME_WIDTH / width

        frame = cv2.resize(
            frame,
            (int(width * scale), int(height * scale)),
            interpolation=cv2.INTER_AREA
        )

    height, width = frame.shape[:2]

    detector.setInputSize((width, height))

    _, faces = detector.detect(frame)

    results = []
    face_count = 0

    if faces is not None:
        face_count = len(faces)

        for face in faces:
            x, y, w, h = face[:4].astype(int)

            try:
                embedding = extract_embedding_from_face(
                    frame,
                    face
                )

                match = recognize_embedding(embedding)

            except Exception:
                logger.exception("Face recognition failed for a frame.")
                match = {
                    "name": "Unknown",
                    "person_id": None,
                    "similarity": 0.0,
                    "recognized": False
                }

            similarity = match["similarity"]
            recognized = match["recognized"]

            if recognized:
                color = (0, 200, 80)
                label = (
                    f'{match["name"]} | '
                    f'{similarity:.2f}'
                )
            else:
                color = (0, 0, 255)
                label = (
                    f'Unknown | '
                    f'{similarity:.2f}'
                )

            cv2.rectangle(
                frame,
                (x, y),
                (x + w, y + h),
                color,
                2
            )

            label_y = max(y - 10, 22)

            cv2.putText(
                frame,
                label,
                (x, label_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.58,
                color,
                2
            )

            results.append({
                "name": match["name"],
                "person_id": match["person_id"],
                "similarity": round(similarity, 4),
                "recognized": recognized
            })

    total_faces_detected = face_count
    last_recognition_results = results

    recognized_count = sum(
        1 for result in results if result["recognized"]
    )

    unknown_count = face_count - recognized_count

    cv2.putText(
        frame,
        f"Faces: {face_count}  Known: {recognized_count}  Unknown: {unknown_count}",
        (15, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.62,
        (0, 255, 255),
        2
    )

    return frame


# --------------------------------------------------
# Annotated MJPEG generator
# --------------------------------------------------

def generate_annotated_stream():

    global last_frame_time

    for frame in read_esp32_frames():

        try:
            annotated_frame = detect_faces(frame)

            success, encoded_frame = cv2.imencode(
                ".jpg",
                annotated_frame,
                [cv2.IMWRITE_JPEG_QUALITY, 80]
            )

            if not success:
                continue

            last_frame_time = time.time()

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + encoded_frame.tobytes()
                + b"\r\n"
            )

        except Exception:
            logger.exception("Frame processing failed.")
            continue


# --------------------------------------------------
# General API endpoints
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "application": "Haven Face Recognition API",
        "status": "running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "detector_loaded": detector is not None,
        "recognizer_loaded": True,
        "recognition_threshold": RECOGNITION_THRESHOLD
    }


@app.get("/camera/status")
def camera_status():

    frame_age = None

    if last_frame_time is not None:
        frame_age = round(
            time.time() - last_frame_time,
            2
        )

    return {
        "connected": camera_connected,
        "last_frame_age_seconds": frame_age,
        "faces_detected": total_faces_detected,
        "recognition_results": last_recognition_results
    }


@app.get("/camera/stream")
def camera_stream():

    return StreamingResponse(
        generate_annotated_stream(),
        media_type=(
            "multipart/x-mixed-replace; boundary=frame"
        ),
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


# --------------------------------------------------
# People enrollment endpoints
# --------------------------------------------------

@app.post("/people/enroll")
async def enroll_person(
    name: str = Form(...),
    images: List[UploadFile] = File(...)
):

    name = name.strip()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Person name cannot be empty."
        )

    if len(images) < 3:
        raise HTTPException(
            status_code=400,
            detail="Upload at least 3 photographs."
        )

    if len(images) > 5:
        raise HTTPException(
            status_code=400,
            detail="Upload no more than 5 photographs."
        )

    embeddings = []

    for uploaded_image in images:

        if uploaded_image.content_type not in [
            "image/jpeg",
            "image/png"
        ]:
            raise HTTPException(
                status_code=400,
                detail="Only JPEG and PNG images are supported."
            )

        image_bytes = await uploaded_image.read()

        if not image_bytes or len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="Each image must be non-empty and no larger than 10 MB."
            )

        image_array = np.frombuffer(
            image_bytes,
            dtype=np.uint8
        )

        image = cv2.imdecode(
            image_array,
            cv2.IMREAD_COLOR
        )

        try:
            embedding = extract_face_embedding(image)
            embeddings.append(embedding.astype(np.float32).tobytes())

        except ValueError as error:
            raise HTTPException(
                status_code=400,
                detail=f"{uploaded_image.filename}: {error}"
            )

        finally:
            await uploaded_image.close()

    person_id = create_person(name, embeddings)

    # Force the next recognition operation to refresh the gallery.
    load_face_gallery(force=True)

    logger.info(
        "Person enrolled: ID=%s, Name=%s, Samples=%s",
        person_id,
        name,
        len(embeddings)
    )

    return {
        "message": "Person enrolled successfully.",
        "person_id": person_id,
        "name": name,
        "samples_saved": len(embeddings)
    }


@app.get("/people")
def list_people():
    return get_people()


@app.delete("/people/{person_id}")
def remove_person(person_id: int):

    deleted = delete_person(person_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Person not found."
        )

    load_face_gallery(force=True)

    logger.info("Person deleted: ID=%s", person_id)

    return {
        "message": "Person and associated face samples deleted.",
        "person_id": person_id
    }


# --------------------------------------------------
# Start server
# --------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        reload=False
    )
