# Sora Desktop Assistant: Architecture & System Design

## 1. System Overview

Sora is a production-grade, transparent floating AI desktop companion for Ubuntu 24.04 Linux. It integrates **Google Gemini Live API** for real-time voice and reasoning with a secure multi-layer agent orchestration system to execute real computer control tasks.

```
                    ┌─────────────────────────┐
                    │      Ubuntu Desktop     │
                    │   (Wayland / X11)       │
                    └───────────┬─────────────┘
                                │
                  ┌─────────────┴─────────────┐
                  │    Sora Assistant GUI     │
                  │   Transparent Frameless   │
                  │  Always-on-Top Floating   │
                  └─────────────┬─────────────┘
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
┌──────────────┐        ┌──────────────┐         ┌──────────────┐
│  Vector/SVG  │        │ Speech Bubble│         │ System Tray  │
│  Character   │        │ Auto-Dismiss │         │ & Shortcuts  │
│  State Engine│        │ Visual Status│         │ (Ctrl+Space) │
└──────────────┘        └──────────────┘         └──────────────┘
       ▲                        ▲                        ▲
       └────────────────────────┼────────────────────────┘
                                │ (IPC Bridge)
                    ┌───────────┴─────────────┐
                    │    Agent Orchestrator   │
                    │  (Task State Machine)   │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│ Local Wake   │        │ Gemini Live  │        │   Memory     │
│ Word Detector│        │ WebSocket    │        │   Storage    │
│ ("Hey Sora") │        │ Bi-di Stream │        │  (SQLite/JSON│
└──────────────┘        └───────┬──────┘        └──────────────┘
                                │ Tool Call
                                ▼
                    ┌─────────────────────────┐
                    │   Permission Manager    │
                    │ SAFE / CONFIRM / BLOCKED│
                    │  Interactive Approval   │
                    └───────────┬─────────────┘
                                │ Approved Action
                                ▼
                    ┌─────────────────────────┐
                    │      Tool Registry      │
                    │ (Controlled Execution)  │
                    └───────────┬─────────────┘
                                │
        ┌──────────────┬────────┼──────────────┬──────────────┐
        ▼              ▼        ▼              ▼              ▼
  Filesystem       Apps     Browser        Gmail &        Computer
  (safe io)     (allowlist) (Playwright)    Drive         Control
```

---

## 2. Character State Machine

The character controller maintains the following lifecycle states:

| State | Visual Behavior | Triggers |
| :--- | :--- | :--- |
| `IDLE` | Soft floating, periodic eye blinking, ambient cyan glow | Application ready, waiting for wake word or prompt |
| `LISTENING` | Perked antenna, wide eyes, concentric radar waves | "Hey Sora" wake word detected or Ctrl+Space pressed |
| `THINKING` | Curious asymmetric tilt, rotating iris halo, purple glow | Speech sent to Gemini, waiting for response |
| `EXECUTING` | High-tech scanning slit visor, radar beam, orange aura | Tool call received from Gemini, performing operation |
| `SPEAKING` | Rhythmic mouth wave synchronized with Gemini 24kHz audio | Incoming audio chunks from Gemini Live API |
| `SUCCESS` | Joyful crescent eyes, smiling mouth, emerald green glow | Multi-step task successfully finished |
| `ERROR` | Worried cross eyes, red warning aura, alert message | Tool error or network failure |
| `WAITING_FOR_CONFIRMATION` | Question mark mouth, amber alert badge, prompt modal | A `CONFIRM` level tool requested (e.g. delete file) |

---

## 3. Audio & Gemini Live Pipeline

### Audio Specifications
- **Input (Microphone to Gemini)**: 16,000 Hz, 16-bit little-endian mono PCM (`audio/pcm;rate=16000`).
- **Output (Gemini to Speaker)**: 24,000 Hz, 16-bit little-endian mono PCM (`audio/pcm;rate=24000`).
- **Offline Wake Word**: Audio is continuously monitored locally by the acoustic / openWakeWord engine without streaming to the cloud. Only when the wake word is detected does the Gemini Live session activate.

### Interruption / Barge-in
- When the user speaks or commands "Stop", the `AudioPlaybackQueue` immediately flushes all buffered audio frames, stops playback nodes, and sends an interruption notification to Gemini Live.

---

## 4. Security & Permission Model

Tools are partitioned into 4 strict security levels:

1. **`SAFE`**: Read-only, non-destructive tools automatically executed without user interruption (e.g., `search_files`, `read_file`, `get_file_info`, `search_email`, `open_application`).
2. **`CONFIRM`**: Modifying or sending operations that require explicit user approval (e.g., `delete_file`, `send_email`, `download_email_attachment`, `browser_click`).
3. **`RESTRICTED`**: Low-level OS automation (e.g., `mouse_move`, coordinate clicks).
4. **`BLOCKED`**: Permanently rejected system actions (unrestricted arbitrary shell execution, security tampering).

### Emergency Stop
Pressing `Ctrl + Shift + Esc` activates the system Emergency Stop, which immediately aborts active tool executions, disconnects browser sessions, flushes audio buffers, and halts the assistant.
