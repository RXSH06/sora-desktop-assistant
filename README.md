# Nova Desktop Assistant 🤖

A production-quality **Linux desktop AI assistant** for Ubuntu 24.04 powered by **Google Gemini Live API**, featuring an animated floating character living in the bottom-right corner of your desktop, offline wake word detection, real-time voice interaction with barge-in interruption, and a secure multi-layer computer control agent architecture.

---

## Key Features

- 🛸 **Living Floating Character**: Stays unobtrusively in the bottom-right corner of your Ubuntu desktop, draggable, resizable, always-on-top, with transparent background.
- 🎭 **8 Reactive Character States**: `IDLE`, `LISTENING`, `THINKING`, `EXECUTING`, `SPEAKING`, `SUCCESS`, `ERROR`, and `WAITING_FOR_CONFIRMATION`.
- 👂 **Offline Local Wake Word**: Say *"Hey Nova"* to trigger listening without constantly streaming your microphone to the cloud.
- ⚡ **Gemini Live Multimodal Voice**: Ultra-low latency bidirectional audio streaming (16kHz PCM input, 24kHz PCM output) with interruption / barge-in ("Stop!").
- 🛡️ **Secure Agent & Permission Architecture**:
  - `SAFE`: Automated execution for safe read-only queries (e.g. search files, list running apps).
  - `CONFIRM`: Destructive or external actions (delete file, send email) require explicit user approval via voice or on-screen prompt.
  - `RESTRICTED` / `BLOCKED`: Dangerous system alterations and arbitrary unrestricted commands are blocked.
  - `Ctrl + Shift + Esc`: Global emergency stop to immediately halt active tools and reset the agent.
- 📁 **Filesystem Tools**: Search files, read, copy, move, rename, delete files, create folders, inspect file info.
- 💻 **Application Control**: Safely launch approved desktop apps (VS Code, KiCad, Chrome, Firefox, Files, Terminal, Calc).
- 🌐 **Browser Automation**: Isolated Playwright browser automation (search, click, type, read page, take screenshots).
- 📧 **Gmail & Google Drive**: Search emails, read messages, download email attachments to specific project folders, draft & send emails, search and download Google Drive files.
- 🧠 **Modular Long-term Memory**: Resolves semantic references (e.g. *"Put the BOM in my Companion Robot project"*) to local paths like `~/Projects/Companion Robot`.
- 🎛️ **Full System Tray & UI**: Control mute status, wake word, permissions, settings, memory, and conversation history.

---

## Project Architecture

```text
desktop-assistant/
├── apps/
│   └── desktop/               # Electron + React + TypeScript desktop runtime
├── packages/
│   ├── agent/                 # Task orchestrator & state machine
│   ├── audio/                 # 16kHz/24kHz PCM audio pipeline & interruption queue
│   ├── browser/               # Isolated Playwright browser automation
│   ├── character/             # Character state system & controller abstraction
│   ├── drive/                 # Google Drive API tools
│   ├── gemini/                # Google Gemini Live API bidirectional WebSocket client
│   ├── gmail/                 # Gmail API tools & local OAuth2 authentication
│   ├── memory/                # Persistent semantic memory store (SQLite / JSON)
│   ├── permissions/           # Permission manager, security guardrails & audit log
│   ├── tools/                 # Tool registry & system automation tools
│   └── wakeword/              # Offline local wake word engine (openWakeWord / acoustic)
├── config/                    # Configuration defaults
├── docs/                      # Architectural and developer guides
├── scripts/                   # Ubuntu installation, autostart, and launch scripts
├── tests/                     # Unit & integration test suite
└── README.md
```

---

## 1. Quick Start & Installation

### Prerequisites
- **OS**: Ubuntu 24.04 LTS (or compatible Linux distribution)
- **Node.js**: v20.x or v22.x LTS (`node -v`)
- **Python**: 3.10+ (for openWakeWord support)

### Automated Setup Script
Run the automated installer script:
```bash
./scripts/install-ubuntu.sh
```

Or manually:
```bash
# 1. Install dependencies across all monorepo workspaces
npm install

# 2. Install Playwright browser binary
npx playwright install chromium

# 3. Build all packages
npm run build
```

---

## 2. Configuration (.env)

Copy the configuration template:
```bash
cp .env.example .env
```

Edit `.env` with your preferred text editor:
```env
# Google Gemini API Configuration (REQUIRED)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=models/gemini-2.0-flash-exp
GEMINI_VOICE=Puck

# Google OAuth Configuration (Optional, for Gmail & Google Drive)
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8089/oauth2callback

# Wake Word Settings
WAKE_WORD="hey nova"
WAKE_WORD_ENABLED=true
WAKE_WORD_SENSITIVITY=0.6

# Application Behavior
APP_ALWAYS_ON_TOP=true
APP_OPACITY=0.96
CHARACTER_SIZE=180
SPEECH_BUBBLE_ENABLED=true
```

> **Note**: API keys and OAuth tokens are stored locally on your machine and never exposed to the frontend renderer.

---

## 3. Running the Assistant

### Launch in Development Mode
```bash
npm run dev
```

### Launch Assistant
```bash
./scripts/launch.sh
```
or:
```bash
npm start
```

---

## 4. How to Use

1. **Wake Word**: Say **"Hey Nova"**. The character will raise its antenna and enter `LISTENING` mode.
2. **Keyboard Shortcut**: Press `Ctrl + Space` anytime to trigger listening without speaking the wake word.
3. **Voice Conversation & Multi-Step Agent Tasks**:
   - *"Hey Nova, what is 25 times 4?"*
   - *"Open VS Code."*
   - *"Find my ESP32 project."*
   - *"Search my inbox for the latest email from Rahul about the PCB, download the BOM attachment, rename it final_bom.xlsx, and copy it to my Companion Robot folder."*
4. **Interruption (Barge-in)**:
   Say **"Stop"** or click anywhere while Nova is speaking to immediately halt audio playback and speech output.
5. **Action Confirmation**:
   When Nova needs to perform an operation requiring confirmation (such as deleting a file or sending an email), it displays an on-screen dialog and asks:
   > *"This will delete `/path/to/file`. Continue?"*
   You can say **"Yes"** or click **"Allow"**.
6. **Emergency Stop**:
   Press `Ctrl + Shift + Esc` at any moment to cancel active tools, abort browser actions, and reset Nova to idle.

---

## 5. Google OAuth Setup (Gmail & Google Drive)

To enable Gmail and Google Drive tools:
1. Visit [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and enable the **Gmail API** and **Google Drive API**.
3. Under **OAuth consent screen**, select External, add your email under test users.
4. Under **Credentials**, create an **OAuth 2.0 Client ID** (Application Type: *Web application*).
5. Add Authorized Redirect URI: `http://localhost:8089/oauth2callback`.
6. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env` or paste them into Nova's **Settings > Google OAuth** panel.
7. Click **"Connect Gmail & Google Drive"**. Your default browser will open to authenticate. Tokens are encrypted locally in `~/.config/nova-assistant/`.

---

## 6. Offline Wake Word Setup

Nova includes a dual wake-word architecture:
1. **Acoustic Syllabic Engine (Default)**: Zero external binary dependencies, runs completely offline, optimized for "Hey Oc-to" cadence.
2. **OpenWakeWord Engine**: Uses ONNX models for neural keyword spotting.
   To use openWakeWord:
   ```bash
   pip install openwakeword onnxruntime
   ```
   Set `"engineType": "openwakeword"` in settings.

---

## 7. Enable Autostart on Ubuntu Boot

To make Nova launch automatically upon logging into Ubuntu:
```bash
./scripts/autostart.sh
```
This generates `~/.config/autostart/nova-assistant.desktop`.

---

## 8. Microphone & Audio Troubleshooting

If audio recording is silent or not detecting:
1. Check PulseAudio / PipeWire default input device:
   ```bash
   pactl list sources short
   ```
2. Verify microphone volume is unmuted:
   ```bash
   alsamixer
   ```
3. Test recording using Linux utilities:
   ```bash
   arecord -d 3 -f S16_LE -r 16000 -c 1 test.wav && aplay test.wav
   ```
4. If Wayland window decorations prevent click-through or transparency on custom compositors, run Electron with Ozone hint:
   ```bash
   npm start -- --ozone-platform-hint=auto
   ```

---

## 9. Running Tests

Run the complete test suite:
```bash
npm test
```

The test suite exercises:
- Character state transitions, speech events, and confirmation workflows
- Permission manager security policies, automatic approvals, and emergency stop
- Modular memory storage and semantic path resolution
- Filesystem tools (search, read, copy, rename, delete, recursive folders, system safety protection)
- Application launcher allowlist and process listing
- Agent orchestrator task lifecycle and interruption handling

---

## 10. Adding New Tools & Custom Avatars

- **Adding Tools**: See [docs/tools_guide.md](docs/tools_guide.md) for how to declare new tools and register them into the permission manager.
- **Customizing Avatars**: See [docs/character_guide.md](docs/character_guide.md) for swapping the vector robot with Live2D, 2D sprites, Lottie, or VRM 3D models.
- **Architecture Deep Dive**: See [docs/architecture.md](docs/architecture.md) for sequence diagrams and security invariants.
