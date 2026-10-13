import os
from pathlib import Path

# The module-level app needs a static dir that exists at import time.
os.environ.setdefault("STATIC_DIR", str(Path(__file__).parent))
