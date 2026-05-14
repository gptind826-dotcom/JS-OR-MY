# Noxylity - Python Web Hosting Platform

A single-user Python web hosting platform with a cyberpunk theme. Upload ZIP Python projects, execute them in isolation, with live logs, input handling - all data stored in a private Telegram Channel. **Zero database required.**

## Features

- **Telegram as Database** - All projects, logs, and generated files stored in a private Telegram Channel
- **ZIP Upload** - Upload Python projects as ZIP archives
- **Live Console** - Real-time log streaming via WebSocket
- **Input Handling** - Interactive stdin when scripts prompt for input (30s timeout)
- **Generated Files** - Auto-detection and storage of output files to Telegram
- **Cyberpunk UI** - Dark theme with neon green accents, liquid glass panels, terminal console
- **Single Admin** - Password-protected access (default: `NOXY_AIRDROPS_BOXY`)

## Tech Stack

- **Backend**: Python + FastAPI + WebSocket
- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Storage**: Telegram Bot API (no database)
- **Auth**: JWT tokens

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- Telegram Bot (create via @BotFather)
- Private Telegram Channel (add bot as admin)

### 1. Install Dependencies

```bash
# Python dependencies
pip install fastapi uvicorn python-multipart python-jose

# Frontend dependencies
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```env
ADMIN_PASSWORD=NOXY_AIRDROPS_BOXY
JWT_SECRET=your-secret-key-here
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHANNEL_ID=-1001234567890
```

**How to get these values:**

1. **Bot Token**: Message @BotFather on Telegram, create a new bot, copy the token
2. **Channel ID**: 
   - Create a private channel on Telegram
   - Add your bot as an administrator
   - Forward any message from the channel to @userinfobot to get the channel ID
   - The ID looks like `-1001234567890`

### 3. Build Frontend

```bash
npm run build
```

### 4. Start Server

```bash
python server/main.py
```

The server will start on `http://localhost:8000`

### 5. Access the App

Open `http://localhost:8000` in your browser.

**Login credentials:**
- Password: `NOXY_AIRDROPS_BOXY` (or your custom `ADMIN_PASSWORD`)

## Project Structure

```
.
├── server/
│   ├── main.py              # FastAPI app with all routes
│   ├── auth.py              # JWT authentication
│   ├── telegram_storage.py  # Telegram as database
│   ├── executor.py          # Python subprocess execution
│   ├── config.py            # Configuration
│   └── run.py               # Development server
├── src/
│   ├── pages/
│   │   ├── Login.tsx        # Login page with leaf particles
│   │   ├── Dashboard.tsx    # Main dashboard with console
│   │   └── Settings.tsx     # Telegram configuration
│   ├── hooks/
│   │   ├── useAuth.ts       # Authentication hook
│   │   └── useWebSocket.ts  # WebSocket log streaming
│   ├── lib/
│   │   └── api.ts           # API client
│   └── ...
├── dist/                     # Built frontend (auto-generated)
└── public/                   # Static assets
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with password |
| GET | `/api/auth/verify` | Verify JWT token |
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Upload new ZIP project |
| POST | `/api/projects/{id}/run` | Run a project |
| POST | `/api/projects/{id}/stop` | Stop a running project |
| POST | `/api/projects/{id}/input` | Send input to running process |
| DELETE | `/api/projects/{id}` | Delete a project |
| GET | `/api/settings` | Get settings |
| POST | `/api/settings/validate` | Validate Telegram config |
| WS | `/ws/exec/{id}` | WebSocket for live logs |

## How It Works

### Telegram Storage Architecture

All data is stored as messages in a private Telegram Channel:

- **PROJECT:<id>:<name>** - Metadata JSON
- **ZIP:<id>:<filename>** - ZIP file (document)
- **LOG:<id>:<timestamp>** - Log file (document)
- **OUTPUT:<id>:<filename>** - Generated output file (document)
- **STATUS:<id>:<status>** - Status update

### Execution Flow

1. User uploads ZIP → Backend extracts, detects main file, stores in Telegram
2. User clicks Run → Backend downloads ZIP, installs requirements, runs subprocess
3. Live logs → Streamed via WebSocket to terminal console
4. Input detection → If process pauses, input prompt appears (30s timeout)
5. Generated files → Post-execution file comparison, uploads to Telegram

## Customization

- Change admin password: Set `ADMIN_PASSWORD` in `.env`
- Change execution timeout: Set `MAX_EXECUTION_TIME` (seconds) in `.env`
- Change input timeout: Set `INPUT_TIMEOUT` (seconds) in `.env`

## License

MIT
