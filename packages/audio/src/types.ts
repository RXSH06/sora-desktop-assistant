export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export interface AudioConfig {
  inputSampleRate: number; // 16000 for Gemini Live
  outputSampleRate: number; // 24000 from Gemini Live
  inputVolume: number; // 0.0 - 1.0
  outputVolume: number; // 0.0 - 1.0
  selectedInputDeviceId?: string;
  selectedOutputDeviceId?: string;
  vadThreshold?: number; // Voice Activity Detection threshold
}

export interface AudioChunk {
  data: Int16Array;
  sampleRate: number;
  timestamp: number;
}
