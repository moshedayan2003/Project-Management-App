import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

STATIC_DIR = Path(os.environ.get("STATIC_DIR", BACKEND_DIR / "static"))
DB_PATH = Path(os.environ.get("DB_PATH", BACKEND_DIR / "data" / "pm.db"))
# Local MVP only; set SESSION_SECRET to override.
SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-only-secret-change-me")
