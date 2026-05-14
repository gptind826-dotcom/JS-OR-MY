"""Python subprocess execution engine with WebSocket streaming."""
import asyncio
import os
import shutil
import subprocess
import time
import zipfile
import hashlib
from datetime import datetime
from typing import Dict, Optional, List, Any, Callable
from dataclasses import dataclass, field

from server.config import TEMP_DIR, MAX_EXECUTION_TIME, INPUT_TIMEOUT
from server.telegram_storage import telegram


@dataclass
class ExecutionState:
    """State of a running execution."""
    project_id: str
    process: subprocess.Popen
    start_time: datetime
    logs: List[Dict[str, Any]] = field(default_factory=list)
    waiting_input: bool = False
    input_timeout: Optional[asyncio.Task] = None
    generated_files: List[str] = field(default_factory=list)
    pre_run_snapshot: Dict[str, str] = field(default_factory=dict)


class ExecutionManager:
    """Manages Python script execution with live streaming."""

    def __init__(self):
        self.executions: Dict[str, ExecutionState] = {}
        self._listeners: Dict[str, List[Callable]] = {}

    def _snapshot_dir(self, directory: str) -> Dict[str, str]:
        """Create a snapshot of files in directory (path -> hash)."""
        snapshot = {}
        for root, _, files in os.walk(directory):
            for f in files:
                filepath = os.path.join(root, f)
                relpath = os.path.relpath(filepath, directory)
                try:
                    with open(filepath, "rb") as fh:
                        snapshot[relpath] = hashlib.md5(fh.read()).hexdigest()
                except Exception:
                    pass
        return snapshot

    def _detect_generated_files(self, directory: str, pre_snapshot: Dict[str, str]) -> List[str]:
        """Detect new or modified files after execution."""
        post_snapshot = self._snapshot_dir(directory)
        generated = []
        for relpath, file_hash in post_snapshot.items():
            if relpath not in pre_snapshot or pre_snapshot[relpath] != file_hash:
                # Skip source files (originally in ZIP)
                if not relpath.startswith("venv/"):
                    generated.append(os.path.join(directory, relpath))
        return generated

    def detect_main_file(self, project_dir: str) -> Optional[str]:
        """Detect the main Python file in a project directory."""
        py_files = []
        for root, _, files in os.walk(project_dir):
            # Skip venv
            if "venv" in root.split(os.sep):
                continue
            for f in files:
                if f.endswith(".py"):
                    py_files.append(f)

        # Priority order
        priority = ["main.py", "app.py", "server.py", "run.py"]
        for p in priority:
            if p in py_files:
                return p

        # If exactly one .py file
        if len(py_files) == 1:
            return py_files[0]

        return None

    async def extract_zip(self, zip_path: str, project_id: str) -> str:
        """Extract ZIP to temp directory. Returns extraction path."""
        extract_dir = os.path.join(TEMP_DIR, project_id)
        os.makedirs(extract_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        return extract_dir

    async def install_requirements(self, project_dir: str, project_id: str, on_log: Callable[[str, str], None]) -> bool:
        """Install requirements if present. Returns success."""
        req_file = os.path.join(project_dir, "requirements.txt")
        if not os.path.exists(req_file):
            return True

        venv_dir = os.path.join(project_dir, "venv")
        # Create virtual environment
        on_log("system", "Creating virtual environment...")
        proc = subprocess.run(
            ["python3", "-m", "venv", venv_dir],
            capture_output=True, text=True, timeout=60,
        )
        if proc.returncode != 0:
            on_log("stderr", f"Failed to create venv: {proc.stderr}")
            return False

        pip_path = os.path.join(venv_dir, "bin", "pip")
        on_log("system", "Installing requirements...")

        proc = subprocess.Popen(
            [pip_path, "install", "-r", "requirements.txt"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            cwd=project_dir,
        )

        while True:
            line = proc.stdout.readline()
            if not line:
                break
            on_log("stdout", line.strip())

        proc.wait(timeout=120)
        if proc.returncode != 0:
            err = proc.stderr.read() if proc.stderr else "Unknown error"
            on_log("stderr", f"Requirements install failed: {err}")
            return False

        on_log("system", "Requirements installed successfully.")
        return True

    async def run_project(
        self,
        project_id: str,
        main_file: str,
        zip_file_id: str,
        on_log: Callable[[str, str], None],
        on_status_change: Callable[[str], None],
        on_input_required: Callable[[], None],
        on_file_generated: Callable[[str, int], None],
    ) -> int:
        """Run a Python project. Returns exit code."""
        project_dir = os.path.join(TEMP_DIR, project_id)

        # Download ZIP if not exists
        if not os.path.exists(project_dir) or not os.listdir(project_dir):
            os.makedirs(project_dir, exist_ok=True)
            zip_path = os.path.join(TEMP_DIR, f"{project_id}.zip")
            await telegram.download_file(zip_file_id, zip_path)
            await self.extract_zip(zip_path, project_id)

        # Install requirements
        success = await self.install_requirements(project_dir, project_id, on_log)
        if not success:
            on_status_change("error")
            return 1

        # Find main file path
        main_path = None
        for root, _, files in os.walk(project_dir):
            if "venv" in root.split(os.sep):
                continue
            if main_file in files:
                main_path = os.path.join(root, main_file)
                break

        if not main_path:
            # Try to find any .py file if main_file not found
            main_path = self._find_any_py(project_dir)
            if not main_path:
                on_log("stderr", f"Main file '{main_file}' not found in project.")
                on_status_change("error")
                return 1

        rel_main = os.path.relpath(main_path, project_dir)

        # Determine Python executable
        venv_python = os.path.join(project_dir, "venv", "bin", "python")
        python_exec = venv_python if os.path.exists(venv_python) else "python3"

        # Take pre-run snapshot
        pre_snapshot = self._snapshot_dir(project_dir)

        on_log("system", f"Starting execution: {rel_main}")
        on_status_change("running")

        # Run subprocess
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        proc = subprocess.Popen(
            [python_exec, rel_main],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.PIPE,
            cwd=project_dir,
            env=env,
            text=True,
            bufsize=1,
        )

        # Store execution state
        exec_state = ExecutionState(
            project_id=project_id,
            process=proc,
            start_time=datetime.utcnow(),
            pre_run_snapshot=pre_snapshot,
        )
        self.executions[project_id] = exec_state

        # Start log readers
        stdout_task = asyncio.create_task(
            self._read_stream(proc.stdout, project_id, "stdout", on_log)
        )
        stderr_task = asyncio.create_task(
            self._read_stream(proc.stderr, project_id, "stderr", on_log)
        )
        monitor_task = asyncio.create_task(
            self._monitor_input(project_id, on_input_required)
        )

        # Wait for process with timeout
        try:
            exit_code = await asyncio.wait_for(
                self._wait_process(proc), timeout=MAX_EXECUTION_TIME,
            )
        except asyncio.TimeoutError:
            on_log("system", "Execution timed out. Killing process...")
            proc.kill()
            exit_code = -1

        # Cancel tasks
        stdout_task.cancel()
        stderr_task.cancel()
        monitor_task.cancel()

        # Detect generated files
        on_log("system", "Scanning for generated files...")
        generated = self._detect_generated_files(project_dir, pre_snapshot)
        for filepath in generated:
            try:
                msg_id = await telegram.store_output_file(filepath, project_id)
                filename = os.path.basename(filepath)
                size = os.path.getsize(filepath)
                on_file_generated(filename, size)
                exec_state.generated_files.append(filename)
            except Exception as e:
                on_log("stderr", f"Failed to upload {filepath}: {e}")

        # Save logs
        log_path = os.path.join(TEMP_DIR, f"{project_id}_log.txt")
        with open(log_path, "w") as f:
            for entry in exec_state.logs:
                ts = entry.get("timestamp", "")
                f.write(f"[{ts}] [{entry['type']}] {entry['message']}\n")
        try:
            await telegram.store_log_file(log_path, project_id)
        except Exception as e:
            on_log("stderr", f"Failed to store log: {e}")

        # Update status
        status = "stopped" if exit_code == 0 else "error"
        on_status_change(status)
        await telegram.store_status_update(project_id, status)

        del self.executions[project_id]
        return exit_code

    def _find_any_py(self, project_dir: str) -> Optional[str]:
        """Find any Python file in project."""
        for root, _, files in os.walk(project_dir):
            if "venv" in root.split(os.sep):
                continue
            for f in files:
                if f.endswith(".py"):
                    return os.path.join(root, f)
        return None

    async def _read_stream(
        self,
        stream,
        project_id: str,
        stream_type: str,
        on_log: Callable[[str, str], None],
    ) -> None:
        """Read from stdout/stderr stream asynchronously."""
        while True:
            try:
                line = await asyncio.get_event_loop().run_in_executor(None, stream.readline)
                if not line:
                    break
                msg = line.strip()
                if msg:
                    timestamp = datetime.utcnow().strftime("%H:%M:%S")
                    entry = {"timestamp": timestamp, "type": stream_type, "message": msg}
                    if project_id in self.executions:
                        self.executions[project_id].logs.append(entry)
                    on_log(stream_type, msg)
            except Exception:
                break

    async def _wait_process(self, proc: subprocess.Popen) -> int:
        """Wait for process to complete asynchronously."""
        while proc.poll() is None:
            await asyncio.sleep(0.1)
        return proc.returncode or 0

    async def _monitor_input(self, project_id: str, on_input_required: Callable[[], None]) -> None:
        """Monitor if process is waiting for input (no output for 3s while running)."""
        last_output_time = time.time()

        while True:
            await asyncio.sleep(1)
            if project_id not in self.executions:
                break

            exec_state = self.executions[project_id]
            if exec_state.process.poll() is not None:
                break

            # Check if process is waiting for input
            if exec_state.waiting_input:
                continue

            # Check if no new logs for 3 seconds
            if exec_state.logs:
                # Simple heuristic: if process is alive but no output
                await asyncio.sleep(3)
                if project_id not in self.executions:
                    break
                exec_state = self.executions[project_id]
                if exec_state.process.poll() is None and not exec_state.waiting_input:
                    exec_state.waiting_input = True
                    on_input_required()

                    # Start input timeout
                    exec_state.input_timeout = asyncio.create_task(
                        self._input_timeout(project_id)
                    )
                    break

    async def _input_timeout(self, project_id: str) -> None:
        """Kill process if no input received within timeout."""
        await asyncio.sleep(INPUT_TIMEOUT)
        if project_id in self.executions:
            exec_state = self.executions[project_id]
            if exec_state.waiting_input:
                exec_state.process.kill()

    async def send_input(self, project_id: str, user_input: str) -> bool:
        """Send input to a running process."""
        if project_id not in self.executions:
            return False

        exec_state = self.executions[project_id]
        if not exec_state.waiting_input:
            return False

        # Cancel timeout
        if exec_state.input_timeout:
            exec_state.input_timeout.cancel()

        # Write to stdin
        proc = exec_state.process
        if proc.stdin:
            proc.stdin.write(user_input + "\n")
            proc.stdin.flush()

        exec_state.waiting_input = False
        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        exec_state.logs.append({
            "timestamp": timestamp, "type": "input", "message": user_input,
        })
        return True

    def stop_project(self, project_id: str) -> bool:
        """Kill a running project."""
        if project_id not in self.executions:
            return False

        proc = self.executions[project_id].process
        proc.terminate()
        # Force kill after 5 seconds
        def force_kill():
            time.sleep(5)
            if proc.poll() is None:
                proc.kill()
        asyncio.create_task(asyncio.get_event_loop().run_in_executor(None, force_kill))
        return True

    def get_status(self, project_id: str) -> str:
        """Get execution status."""
        if project_id not in self.executions:
            return "stopped"
        return "running"


executor = ExecutionManager()
