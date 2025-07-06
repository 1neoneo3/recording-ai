export interface RecordingConfig {
  sampleRate: number;
  channels: number;
  audioType: 'wav' | 'raw';
  duration?: number;
  outputPath?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
  segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface AudioFile {
  path: string;
  duration: number;
  size: number;
  format: string;
  sampleRate: number;
  channels: number;
}

export interface RecordingSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  audioFile?: AudioFile;
  transcription?: TranscriptionResult;
  status: 'recording' | 'processing' | 'completed' | 'error';
}