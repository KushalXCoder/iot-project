from pathlib import Path

import cv2
import numpy as np


BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"

YUNET_PATH = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = MODEL_DIR / "face_recognition_sface_2021dec.onnx"

if not YUNET_PATH.exists():
    raise FileNotFoundError(f"YuNet model missing: {YUNET_PATH}")

if not SFACE_PATH.exists():
    raise FileNotFoundError(f"SFace model missing: {SFACE_PATH}")


enrollment_detector = cv2.FaceDetectorYN.create(
    str(YUNET_PATH),
    "",
    (320, 320),
    0.65,
    0.30,
    5000,
    cv2.dnn.DNN_BACKEND_OPENCV,
    cv2.dnn.DNN_TARGET_CPU
)

recognizer = cv2.FaceRecognizerSF.create(
    str(SFACE_PATH),
    "",
    cv2.dnn.DNN_BACKEND_OPENCV,
    cv2.dnn.DNN_TARGET_CPU
)


def normalize_embedding(embedding):
    embedding = np.asarray(embedding, dtype=np.float32).reshape(-1)

    if not np.all(np.isfinite(embedding)):
        raise ValueError("Embedding contains invalid numerical values.")

    norm = np.linalg.norm(embedding)
    if norm <= 1e-12:
        raise ValueError("Embedding has zero magnitude.")

    return embedding / norm


def extract_embedding_from_face(image, face):
    """
    Align a face using YuNet's five landmarks and extract
    a normalized SFace embedding.
    """
    if image is None or face is None:
        raise ValueError("Image or detected face is missing.")

    aligned_face = recognizer.alignCrop(image, face)
    raw_embedding = recognizer.feature(aligned_face)

    return normalize_embedding(raw_embedding)


def extract_face_embedding(image):
    """
    Enrollment helper: detect exactly one face, align it,
    and return its normalized SFace embedding.
    """
    if image is None:
        raise ValueError("Invalid image.")

    height, width = image.shape[:2]
    enrollment_detector.setInputSize((width, height))

    _, faces = enrollment_detector.detect(image)

    if faces is None or len(faces) == 0:
        raise ValueError("No face detected in the image.")

    if len(faces) > 1:
        raise ValueError(
            "Multiple faces detected. Upload an image containing only one person."
        )

    face = faces[0]
    x, y, w, h = face[:4]

    if w < 80 or h < 80:
        raise ValueError("Face is too small. Use a closer photograph.")

    return extract_embedding_from_face(image, face)
