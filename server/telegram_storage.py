"""Telegram Channel as Database - storage layer."""
import json
import os
import aiohttp
from typing import Optional, List, Dict, Any
from datetime import datetime
from server.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID

BASE_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


class TelegramStorage:
    """All data stored in Telegram Channel - no local database."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def _request(self, method: str, **params) -> dict:
        """Make async request to Telegram Bot API."""
        url = f"{BASE_URL}/{method}"
        async with aiohttp.ClientSession() as session:
            if method in ("sendDocument",):
                data = aiohttp.FormData()
                for k, v in params.items():
                    if k == "document" and os.path.isfile(v):
                        data.add_field(k, open(v, "rb"), filename=os.path.basename(v))
                    else:
                        data.add_field(k, str(v))
                async with session.post(url, data=data) as resp:
                    result = await resp.json()
            else:
                async with session.post(url, json=params) as resp:
                    result = await resp.json()

        if not result.get("ok"):
            raise Exception(f"Telegram API error: {result}")
        return result["result"]

    async def _request_get(self, method: str, **params) -> dict:
        """Make GET request to Telegram Bot API."""
        url = f"{BASE_URL}/{method}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as resp:
                result = await resp.json()
        if not result.get("ok"):
            raise Exception(f"Telegram API error: {result}")
        return result["result"]

    async def send_document(self, file_path: str, caption: str) -> int:
        """Send a document to the channel. Returns message_id."""
        result = await self._request(
            "sendDocument",
            chat_id=TELEGRAM_CHANNEL_ID,
            document=file_path,
            caption=caption,
        )
        return result["message_id"]

    async def send_message(self, text: str) -> int:
        """Send a text message to the channel. Returns message_id."""
        result = await self._request(
            "sendMessage",
            chat_id=TELEGRAM_CHANNEL_ID,
            text=text,
            parse_mode="HTML",
        )
        return result["message_id"]

    async def edit_message(self, message_id: int, text: str) -> None:
        """Edit an existing message."""
        try:
            await self._request(
                "editMessageText",
                chat_id=TELEGRAM_CHANNEL_ID,
                message_id=message_id,
                text=text,
                parse_mode="HTML",
            )
        except Exception:
            pass  # Message might not be editable

    async def get_file_url(self, file_id: str) -> str:
        """Get download URL for a file."""
        result = await self._request_get("getFile", file_id=file_id)
        file_path = result["file_path"]
        return f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}"

    async def download_file(self, file_id: str, destination: str) -> None:
        """Download a file by file_id to destination path."""
        url = await self.get_file_url(file_id)
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                with open(destination, "wb") as f:
                    f.write(await resp.read())

    async def get_channel_messages(self, limit: int = 200) -> List[Dict[str, Any]]:
        """Get recent messages from channel via getUpdates."""
        # Get updates and filter for channel messages
        result = await self._request_get("getUpdates", limit=limit)
        messages = []
        for update in result:
            msg = update.get("message") or update.get("channel_post")
            if msg and str(msg.get("chat", {}).get("id")) == str(TELEGRAM_CHANNEL_ID):
                messages.append(msg)
        return messages

    async def forward_message(self, from_chat_id: str, message_id: int) -> Dict:
        """Forward a message to get file_id access."""
        return await self._request(
            "forwardMessage",
            chat_id=TELEGRAM_CHANNEL_ID,
            from_chat_id=from_chat_id,
            message_id=message_id,
        )

    # ── Project-specific helpers ──────────────────────────────

    async def store_project_metadata(self, project: dict) -> int:
        """Store project metadata as a text message. Returns message_id."""
        caption = f"PROJECT:{project['id']}:{project['name']}"
        text = f"{caption}\n{json.dumps(project, default=str)}"
        return await self.send_message(text)

    async def store_zip_file(self, file_path: str, project_id: str, original_name: str) -> int:
        """Store ZIP file in channel. Returns message_id."""
        caption = f"ZIP:{project_id}:{original_name}"
        return await self.send_document(file_path, caption)

    async def store_log_file(self, file_path: str, project_id: str) -> int:
        """Store log file in channel. Returns message_id."""
        timestamp = datetime.utcnow().isoformat()
        caption = f"LOG:{project_id}:{timestamp}"
        return await self.send_document(file_path, caption)

    async def store_output_file(self, file_path: str, project_id: str) -> int:
        """Store generated output file in channel. Returns message_id."""
        filename = os.path.basename(file_path)
        caption = f"OUTPUT:{project_id}:{filename}"
        return await self.send_document(file_path, caption)

    async def store_status_update(self, project_id: str, status: str) -> int:
        """Store status update as text message."""
        text = f"STATUS:{project_id}:{status}"
        return await self.send_message(text)

    async def list_projects(self) -> List[Dict[str, Any]]:
        """Reconstruct project list from Telegram messages."""
        messages = await self.get_channel_messages(limit=200)

        # Group by project_id
        projects_map: Dict[str, Dict] = {}

        for msg in messages:
            text = msg.get("text", "") or msg.get("caption", "")
            if not text:
                continue

            # Parse PROJECT metadata
            if text.startswith("PROJECT:"):
                parts = text.split(":", 2)
                if len(parts) >= 3:
                    project_id = parts[1]
                    try:
                        json_str = text.split("\n", 1)[1]
                        metadata = json.loads(json_str)
                        projects_map[project_id] = {
                            **metadata,
                            "_metadata_msg_id": msg["message_id"],
                        }
                    except (json.JSONDecodeError, IndexError):
                        pass

            # Parse ZIP files
            elif text.startswith("ZIP:"):
                parts = text.split(":", 2)
                if len(parts) >= 3:
                    project_id = parts[1]
                    if project_id in projects_map:
                        doc = msg.get("document")
                        if doc:
                            projects_map[project_id]["zip_file_id"] = doc["file_id"]
                            projects_map[project_id]["zip_message_id"] = msg["message_id"]

            # Parse STATUS updates
            elif text.startswith("STATUS:"):
                parts = text.split(":", 2)
                if len(parts) >= 3:
                    project_id = parts[1]
                    status = parts[2]
                    if project_id in projects_map:
                        projects_map[project_id]["status"] = status
                        projects_map[project_id]["_latest_status_msg_id"] = msg["message_id"]

            # Parse OUTPUT files
            elif text.startswith("OUTPUT:"):
                parts = text.split(":", 2)
                if len(parts) >= 3:
                    project_id = parts[1]
                    filename = parts[2]
                    if project_id in projects_map:
                        if "generatedFiles" not in projects_map[project_id]:
                            projects_map[project_id]["generatedFiles"] = []
                        doc = msg.get("document")
                        if doc:
                            projects_map[project_id]["generatedFiles"].append({
                                "filename": filename,
                                "size": doc.get("file_size", 0),
                                "messageId": msg["message_id"],
                                "fileId": doc["file_id"],
                                "createdAt": datetime.utcnow().isoformat(),
                            })

        # Convert to list and clean up internal fields
        projects = []
        for pid, data in projects_map.items():
            clean = {k: v for k, v in data.items() if not k.startswith("_")}
            projects.append(clean)

        # Sort by createdAt desc
        projects.sort(key=lambda p: p.get("createdAt", ""), reverse=True)
        return projects

    async def validate_config(self, bot_token: str, channel_id: str) -> tuple[bool, Optional[str]]:
        """Test Telegram configuration by sending a test message."""
        test_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(test_url, json={
                    "chat_id": channel_id,
                    "text": "Noxylity: Configuration test successful.",
                }) as resp:
                    result = await resp.json()
                    if result.get("ok"):
                        return True, None
                    else:
                        return False, result.get("description", "Unknown error")
        except Exception as e:
            return False, str(e)


telegram = TelegramStorage()
