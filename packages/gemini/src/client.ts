import WebSocket from 'ws';
import { GeminiLiveConfig, GeminiLiveEvent, GeminiLiveToolCall } from './types.js';

const LIVE_API_HOST = 'generativelanguage.googleapis.com';
const LIVE_API_PATH = '/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private config: GeminiLiveConfig;
  private listeners: Set<(event: GeminiLiveEvent) => void> = new Set();
  private isConnecting: boolean = false;
  private isExplicitlyClosed: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(config: GeminiLiveConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<GeminiLiveConfig>): void {
    this.config = { ...this.config, ...config };
  }

  subscribe(listener: (event: GeminiLiveEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GeminiLiveEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in GeminiLiveClient listener:', err);
      }
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnected() || this.isConnecting) return;
    if (!this.config.apiKey) {
      throw new Error('GEMINI_API_KEY is required to connect to Gemini Live.');
    }

    this.isExplicitlyClosed = false;
    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const url = `wss://${LIVE_API_HOST}${LIVE_API_PATH}?key=${this.config.apiKey}`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.sendSetupMessage();
        this.emit({ type: 'connected' });
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code, reason) => {
        this.isConnecting = false;
        this.ws = null;
        this.emit({
          type: 'disconnected',
          reason: `Closed (${code}): ${reason.toString()}`,
        });

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err) => {
        this.isConnecting = false;
        this.emit({ type: 'error', error: err });
        if (this.isConnecting) {
          reject(err);
        }
      });
    });
  }

  private sendSetupMessage(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    let model = this.config.model || 'models/gemini-3.8-live';
    if (!model.startsWith('models/')) {
      model = `models/${model}`;
    }
    const voice = this.config.voice || 'Puck';

    const setupMsg: Record<string, unknown> = {
      setup: {
        model,
        generationConfig: {
          responseModalities: this.config.responseModalities || ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
        },
      },
    };

    if (this.config.systemInstruction) {
      (setupMsg.setup as any).systemInstruction = {
        parts: [{ text: this.config.systemInstruction }],
      };
    }

    if (this.config.tools && this.config.tools.length > 0) {
      (setupMsg.setup as any).tools = [
        {
          functionDeclarations: this.config.tools,
        },
      ];
    }

    this.ws.send(JSON.stringify(setupMsg));
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const parsed = JSON.parse(data.toString());

      // 1. Check for serverContent
      if (parsed.serverContent) {
        if (parsed.serverContent.interrupted) {
          this.emit({ type: 'interrupted' });
        }

        const modelTurn = parsed.serverContent.modelTurn;
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            if (part.text) {
              this.emit({ type: 'text', text: part.text });
            }
            if (part.inlineData?.mimeType?.startsWith('audio/pcm') && part.inlineData.data) {
              this.emit({ type: 'audio', pcm24Base64: part.inlineData.data });
            }
          }
        }

        if (parsed.serverContent.turnComplete) {
          this.emit({ type: 'turn_complete' });
        }
      }

      // 2. Check for toolCall
      if (parsed.toolCall?.functionCalls) {
        const toolCalls: GeminiLiveToolCall[] = parsed.toolCall.functionCalls.map((fc: any) => ({
          id: fc.id || `call_${Date.now()}`,
          name: fc.name,
          args: fc.args || {},
        }));
        this.emit({ type: 'tool_call', toolCalls });
      }
    } catch (err: any) {
      console.error('Error parsing Gemini Live message:', err);
    }
  }

  sendAudioChunk(pcm16Base64: string): void {
    if (!this.isConnected()) return;

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: pcm16Base64,
          },
        ],
      },
    };

    this.ws?.send(JSON.stringify(message));
  }

  finishUserTurn(): void {
    if (!this.isConnected()) return;

    const message = {
      clientContent: {
        turnComplete: true,
      },
    };

    this.ws?.send(JSON.stringify(message));
  }

  sendTextMessage(text: string): void {
    if (!this.isConnected()) return;

    const message = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws?.send(JSON.stringify(message));
  }

  sendToolResponse(toolCallId: string, output: unknown): void {
    if (!this.isConnected()) return;

    const message = {
      toolResponse: {
        functionResponses: [
          {
            response: { output },
            id: toolCallId,
          },
        ],
      },
    };

    this.ws?.send(JSON.stringify(message));
  }

  sendInterruptionNotice(): void {
    // Let Gemini know client interrupted output
    if (!this.isConnected()) return;
    this.sendTextMessage('[User interrupted speaking]');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isExplicitlyClosed) {
        this.connect().catch((err) => {
          console.warn('Gemini Live reconnect attempt failed:', err.message);
        });
      }
    }, delay);
  }

  disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'User requested disconnect');
      this.ws = null;
    }
  }
}
