import { useEffect, useRef } from 'react';
import { base64ToInt16, int16ToFloat32, float32ToInt16, int16ToBase64, resampleAudio } from '@assistant/audio';

interface AudioControllerProps {
  isMuted: boolean;
  onMicLevelChange?: (level: number) => void;
}

export const AudioController: React.FC<AudioControllerProps> = ({ isMuted, onMicLevelChange }) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Playback queue tracking
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef<number>(0);

  // Initialize Microphone Capture
  useEffect(() => {
    let active = true;

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        audioSourceRef.current = source;

        // Buffer size 4096 gives ~85ms chunks at 48kHz
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (isMuted) return;

          const inputFloat32 = e.inputBuffer.getChannelData(0);

          // Calculate energy level for UI visualizer
          let sumSquares = 0;
          for (let i = 0; i < inputFloat32.length; i++) {
            sumSquares += inputFloat32[i] * inputFloat32[i];
          }
          const rms = Math.sqrt(sumSquares / inputFloat32.length);
          onMicLevelChange?.(Math.min(1, rms * 8));

          // Resample from hardware rate (e.g. 48000 or 44100) to 16000 for Gemini Live
          const resampledFloat = resampleAudio(inputFloat32, ctx.sampleRate, 16000);
          const int16Data = float32ToInt16(resampledFloat);
          const base64Chunk = int16ToBase64(int16Data);

          window.assistantAPI.sendAudioChunk(base64Chunk);
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      } catch (err) {
        console.warn('Microphone capture not started or permission denied:', err);
      }
    }

    startRecording();

    return () => {
      active = false;
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [isMuted]);

  // Handle Incoming 24kHz PCM Audio Playback
  useEffect(() => {
    // Playback AudioContext fixed at 24000Hz (Gemini Live standard)
    const playbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });

    const cleanupAudioOutput = window.assistantAPI.onAudioOutput((pcm24Base64) => {
      try {
        const int16 = base64ToInt16(pcm24Base64);
        const float32 = int16ToFloat32(int16);

        const buffer = playbackCtx.createBuffer(1, float32.length, 24000);
        buffer.copyToChannel(float32 as any, 0);

        const source = playbackCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(playbackCtx.destination);

        const now = playbackCtx.currentTime;
        const startTime = Math.max(now, nextPlayTimeRef.current);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + buffer.duration;

        activeSourcesRef.current.push(source);
        source.onended = () => {
          activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        };
      } catch (err) {
        console.error('Error playing Gemini audio output:', err);
      }
    });

    // Handle Interruption / Barge-in
    const cleanupInterrupt = window.assistantAPI.onAudioInterrupt(() => {
      for (const s of activeSourcesRef.current) {
        try {
          s.stop();
        } catch {}
      }
      activeSourcesRef.current = [];
      nextPlayTimeRef.current = playbackCtx.currentTime;
    });

    return () => {
      cleanupAudioOutput();
      cleanupInterrupt();
      playbackCtx.close().catch(() => {});
    };
  }, []);

  return null;
};
