"""Configuration for Noxylity backend."""
import os
from dotenv import load_dotenv

load_dotenv()

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "NOXY_AIRDROPS_BOXY")
JWT_SECRET = os.getenv("JWT_SECRET", "noxylity-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHANNEL_ID = os.getenv("TELEGRAM_CHANNEL_ID", "")

MAX_EXECUTION_TIME = int(os.getenv("MAX_EXECUTION_TIME", "300"))  # seconds
INPUT_TIMEOUT = int(os.getenv("INPUT_TIMEOUT", "30"))  # seconds
TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/noxylity")

os.makedirs(TEMP_DIR, exist_ok=True)
