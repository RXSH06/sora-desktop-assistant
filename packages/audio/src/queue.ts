import { base64ToInt16, int16ToFloat32 } from './pcm.js';

export interface AudioPlaybackQueueOptions {
  sampleRate?: number; // default 24000
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
}

export class AudioPlaybackQueue {
  private sampleRate: number;
  private queue: Float32Array[] = [];
  private isPlaying: boolean = false;
  private onPlaybackStart?: () => void;
  private onPlaybackEnd?: () => void;

  constructor(options: AudioPlaybackQueueOptions = {}) {
    this.sampleRate = options.sampleRate || 24000;
    this.onPlaybackStart = options.onPlaybackStart;
    this.onPlaybackEnd = options.onPlaybackEnd;
  }

  enqueueBase64(base64Pcm: string): void {
    const int16 = base64ToInt16(base64Pcm);
    const float32 = int16ToFloat32(int16);
    this.queue.push(float32);
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onPlaybackStart?.();
    }
  }

  dequeue(): Float32Array | undefined {
    const item = this.queue.shift();
    if (!item && this.isPlaying) {
      this.isPlaying = false;
      this.onPlaybackEnd?.();
    }
    return item;
  }

  interrupt(): void {
    this.markAllPlayed();
  }

  /**
   * Called when the renderer confirms that every chunk it was sent has
   * finished playing. Drains the mirror queue so `hasPending()` reflects
   * real playback instead of growing forever.
   */
  markAllPlayed(): void {
    this.queue = [];
    if (this.isPlaying) {
      this.isPlaying = false;
      this.onPlaybackEnd?.();
    }
  }

  hasPending(): boolean {
    return this.queue.length > 0;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}
