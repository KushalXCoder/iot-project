import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "haven.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialize_database():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS people (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS face_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id INTEGER NOT NULL,
                embedding BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (person_id)
                    REFERENCES people(id)
                    ON DELETE CASCADE
            )
        """)
        conn.commit()


def create_person(name, embeddings):
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO people (name) VALUES (?)",
            (name,)
        )
        person_id = cursor.lastrowid

        for embedding in embeddings:
            conn.execute(
                """
                INSERT INTO face_samples (person_id, embedding)
                VALUES (?, ?)
                """,
                (person_id, embedding)
            )

        conn.commit()
        return person_id


def get_people():
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT
                p.id,
                p.name,
                p.created_at,
                COUNT(f.id) AS sample_count
            FROM people p
            LEFT JOIN face_samples f ON p.id = f.person_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        """).fetchall()
        return [dict(row) for row in rows]


def get_all_face_samples():
    """
    Return enrolled face embeddings with their person IDs and names.
    Embeddings are stored as float32 byte arrays.
    """
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT
                p.id AS person_id,
                p.name AS person_name,
                f.embedding AS embedding
            FROM people p
            INNER JOIN face_samples f ON p.id = f.person_id
            ORDER BY p.id, f.id
        """).fetchall()

        return [
            {
                "person_id": row["person_id"],
                "person_name": row["person_name"],
                "embedding": row["embedding"]
            }
            for row in rows
        ]


def delete_person(person_id):
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM people WHERE id = ?",
            (person_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
