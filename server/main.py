"""Noxylity - Python Hosting Platform with Telegram Storage."""
import json
import os
import secrets
import shutil
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import (Depends, FastAPI, File, Form, HTTPException, UploadFile,
                     WebSocket, WebSocketDisconnect, status)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles

from server.auth import create_access_token, verify_password, verify_token
from server.config import (ADMIN_PASSWORD, MAX_EXECUTION_TIME, TEMP_DIR,
                           TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID)
from server.executor import executor
from server.telegram_storage import telegram

security = HTTPBearer()
app = FastAPI(title="Noxylity", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════
# Auth Routes
# ═══════════════════════════════════════════════════════

@app.post("/api/auth/login")
async def login(data: dict):
    """Admin login with password."""
    password = data.get("password", "")
    if not verify_password(password):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_access_token()
    return {"token": token, "success": True}


@app.get("/api/auth/verify")
async def auth_verify(username: str = Depends(verify_token)):
    """Verify token is valid."""
    return {"valid": True, "user": username}


# ═══════════════════════════════════════════════════════
# Project Routes
# ═══════════════════════════════════════════════════════

@app.get("/api/projects")
async def list_projects(username: str = Depends(verify_token)):
    """List all projects (reconstructed from Telegram)."""
    try:
        projects = await telegram.list_projects()
        return {"projects": projects}
    except Exception as e:
        return {"projects": [], "error": str(e)}


@app.post("/api/projects")
async def create_project(
    name: str = Form(...),
    mainFile: Optional[str] = Form(None),
    file: UploadFile = File(...),
    username: str = Depends(verify_token),
):
    """Upload a new ZIP project."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(400, detail="Only ZIP files allowed")

    # Generate project ID
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    random_str = secrets.token_hex(3)
    project_id = f"{timestamp}_{random_str}"

    # Save ZIP temporarily
    zip_path = os.path.join(TEMP_DIR, f"{project_id}.zip")
    with open(zip_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Extract to detect main file
    extract_dir = os.path.join(TEMP_DIR, project_id)
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)

    # Detect main file
    detected_main = executor.detect_main_file(extract_dir)
    final_main = mainFile or detected_main or "main.py"

    # Check for requirements.txt
    has_req = os.path.exists(os.path.join(extract_dir, "requirements.txt"))

    # Store in Telegram
    zip_msg_id = await telegram.store_zip_file(zip_path, project_id, file.filename)

    # Get file_id for the ZIP
    messages = await telegram.get_channel_messages(limit=50)
    zip_file_id = None
    for msg in messages:
        if msg.get("message_id") == zip_msg_id:
            doc = msg.get("document")
            if doc:
                zip_file_id = doc["file_id"]
            break

    project_data = {
        "id": project_id,
        "name": name or file.filename.replace(".zip", ""),
        "originalName": file.filename,
        "mainFile": final_main,
        "status": "stopped",
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
        "hasRequirements": has_req,
        "zipMessageId": zip_msg_id,
        "zipFileId": zip_file_id,
        "generatedFiles": [],
    }

    await telegram.store_project_metadata(project_data)
    await telegram.store_status_update(project_id, "stopped")

    # Cleanup temp extract
    shutil.rmtree(extract_dir, ignore_errors=True)

    return {"project": project_data, "detectedMainFile": detected_main}


@app.post("/api/projects/{project_id}/run")
async def run_project(
    project_id: str,
    data: dict,
    username: str = Depends(verify_token),
):
    """Start executing a project."""
    main_file = data.get("mainFile", "main.py")

    # Get project from Telegram
    projects = await telegram.list_projects()
    project = None
    for p in projects:
        if p["id"] == project_id:
            project = p
            break

    if not project:
        raise HTTPException(404, detail="Project not found")

    zip_file_id = project.get("zipFileId")
    if not zip_file_id:
        raise HTTPException(400, detail="ZIP file not found in Telegram")

    # Run in background
    import asyncio
    asyncio.create_task(_run_in_background(project_id, main_file, zip_file_id))

    return {"success": True, "status": "running"}


async def _run_in_background(project_id: str, main_file: str, zip_file_id: str):
    """Run project and stream logs via WebSocket."""
    connections = active_connections.get(project_id, [])

    def on_log(log_type: str, message: str):
        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        entry = {"timestamp": timestamp, "type": log_type, "message": message}
        # Store log in memory
        if project_id not in log_buffers:
            log_buffers[project_id] = []
        log_buffers[project_id].append(entry)
        # Send to WebSocket clients
        for ws in active_connections.get(project_id, []):
            import asyncio
            asyncio.create_task(ws.send_json({
                "type": "log", "data": entry,
            }))

    def on_status_change(status: str):
        for ws in active_connections.get(project_id, []):
            import asyncio
            asyncio.create_task(ws.send_json({
                "type": "status_change", "data": {"status": status},
            }))

    def on_input_required():
        for ws in active_connections.get(project_id, []):
            import asyncio
            asyncio.create_task(ws.send_json({
                "type": "input_required", "data": {"prompt": "Enter input:"},
            }))

    def on_file_generated(filename: str, size: int):
        for ws in active_connections.get(project_id, []):
            import asyncio
            asyncio.create_task(ws.send_json({
                "type": "file_generated", "data": {"filename": filename, "size": size},
            }))

    try:
        exit_code = await executor.run_project(
            project_id=project_id,
            main_file=main_file,
            zip_file_id=zip_file_id,
            on_log=on_log,
            on_status_change=on_status_change,
            on_input_required=on_input_required,
            on_file_generated=on_file_generated,
        )
        for ws in active_connections.get(project_id, []):
            import asyncio
            asyncio.create_task(ws.send_json({
                "type": "completed", "data": {"exitCode": exit_code},
            }))
    except Exception as e:
        on_log("stderr", f"Execution error: {str(e)}")
        on_status_change("error")


@app.post("/api/projects/{project_id}/stop")
async def stop_project(project_id: str, username: str = Depends(verify_token)):
    """Stop a running project."""
    success = executor.stop_project(project_id)
    if success:
        await telegram.store_status_update(project_id, "stopped")
    return {"success": success}


@app.post("/api/projects/{project_id}/input")
async def send_input(
    project_id: str,
    data: dict,
    username: str = Depends(verify_token),
):
    """Send input to a running process."""
    user_input = data.get("input", "")
    success = await executor.send_input(project_id, user_input)
    return {"success": success}


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, username: str = Depends(verify_token)):
    """Delete a project."""
    # Stop if running
    executor.stop_project(project_id)

    # Clean temp files
    project_dir = os.path.join(TEMP_DIR, project_id)
    shutil.rmtree(project_dir, ignore_errors=True)

    zip_path = os.path.join(TEMP_DIR, f"{project_id}.zip")
    if os.path.exists(zip_path):
        os.remove(zip_path)

    return {"success": True}


@app.get("/api/projects/{project_id}/logs")
async def get_logs(project_id: str, username: str = Depends(verify_token)):
    """Get logs for a project from buffer."""
    logs = log_buffers.get(project_id, [])
    return {"logs": logs}


@app.post("/api/projects/{project_id}/clear-logs")
async def clear_logs(project_id: str, username: str = Depends(verify_token)):
    """Clear logs buffer."""
    if project_id in log_buffers:
        log_buffers[project_id] = []
    return {"success": True}


# ═══════════════════════════════════════════════════════
# Settings Routes
# ═══════════════════════════════════════════════════════

@app.post("/api/settings/validate")
async def validate_settings(data: dict, username: str = Depends(verify_token)):
    """Validate Telegram configuration."""
    bot_token = data.get("botToken", "")
    channel_id = data.get("channelId", "")

    valid, error = await telegram.validate_config(bot_token, channel_id)
    return {"valid": valid, "error": error}


@app.get("/api/settings")
async def get_settings(username: str = Depends(verify_token)):
    """Get current settings (masked)."""
    return {
        "botToken": "***" if TELEGRAM_BOT_TOKEN else "",
        "channelId": TELEGRAM_CHANNEL_ID,
    }


# ═══════════════════════════════════════════════════════
# WebSocket for Live Logs
# ═══════════════════════════════════════════════════════

active_connections: Dict[str, List[WebSocket]] = {}
log_buffers: Dict[str, List[Dict]] = {}


@app.websocket("/ws/exec/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    """WebSocket endpoint for real-time log streaming."""
    await websocket.accept()

    if project_id not in active_connections:
        active_connections[project_id] = []
    active_connections[project_id].append(websocket)

    # Send existing logs
    existing = log_buffers.get(project_id, [])
    if existing:
        await websocket.send_json({
            "type": "history", "data": {"logs": existing[-1000:]},
        })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "send_input":
                user_input = data.get("input", "")
                await executor.send_input(project_id, user_input)
                # Echo to clients
                for ws in active_connections.get(project_id, []):
                    await ws.send_json({
                        "type": "input_sent", "data": {"input": user_input},
                    })

            elif msg_type == "stop":
                executor.stop_project(project_id)
                await telegram.store_status_update(project_id, "stopped")
                for ws in active_connections.get(project_id, []):
                    await ws.send_json({
                        "type": "status_change", "data": {"status": "stopped"},
                    })

            elif msg_type == "clear_logs":
                if project_id in log_buffers:
                    log_buffers[project_id] = []
                for ws in active_connections.get(project_id, []):
                    await ws.send_json({"type": "cleared"})

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if project_id in active_connections:
            if websocket in active_connections[project_id]:
                active_connections[project_id].remove(websocket)
            if not active_connections[project_id]:
                del active_connections[project_id]


# ═══════════════════════════════════════════════════════
# Health Check
# ═══════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ═══════════════════════════════════════════════════════
# Serve Frontend
# ═══════════════════════════════════════════════════════

# Mount static files
dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")
if os.path.exists(dist_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")

@app.get("/")
async def serve_frontend():
    """Serve the React frontend."""
    index_path = os.path.join(dist_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Noxylity API - React frontend not built yet. Run 'npm run build' first."}


@app.get("/{path:path}")
async def serve_frontend_routes(path: str):
    """Serve React frontend for all routes."""
    # Skip API and WS routes
    if path.startswith("api") or path.startswith("ws"):
        raise HTTPException(404)

    # Try to serve static file first
    static_path = os.path.join(dist_dir, path)
    if os.path.exists(static_path) and os.path.isfile(static_path):
        return FileResponse(static_path)

    # Fallback to index.html for SPA routing
    index_path = os.path.join(dist_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(404)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
