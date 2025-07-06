import { VADService } from './VADService.js';
import { WhisperService } from './WhisperService.js';
import { TranscriptionResult } from '../types/index.js';

export interface RealtimeRecordingOptions {
  minSegmentDuration?: number; // Minimum segment duration in seconds
  maxSegmentDuration?: number; // Maximum segment duration in seconds
  sampleRate?: number;
  vadOptions?: {
    threshold?: number;
    interval?: number;
  };
}

export class RealtimeRecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private vadService: VADService | null = null;
  private whisperService: WhisperService;
  private audioChunks: Blob[] = [];
  private segmentStartTime: number = 0;
  private isRecording: boolean = false;
  private isSpeaking: boolean = false;
  private onTranscriptionCallback?: (result: TranscriptionResult) => void;
  private silenceTimeout?: NodeJS.Timeout;
  
  private readonly options: Required<RealtimeRecordingOptions>;

  constructor(
    whisperService: WhisperService,
    options: RealtimeRecordingOptions = {}
  ) {
    this.whisperService = whisperService;
    this.options = {
      minSegmentDuration: options.minSegmentDuration || 10, // 10 seconds minimum
      maxSegmentDuration: options.maxSegmentDuration || 30, // 30 seconds maximum
      sampleRate: options.sampleRate || 16000,
      vadOptions: options.vadOptions || {
        threshold: -50,
        interval: 50
      }
    };
  }

  /**
   * Start realtime recording with voice activity detection
   */
  async startRecording(
    audioStream: MediaStream,
    onTranscription: (result: TranscriptionResult) => void
  ): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    this.onTranscriptionCallback = onTranscription;
    this.audioChunks = [];
    this.segmentStartTime = Date.now();

    // Initialize MediaRecorder
    const mimeType = this.getSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(audioStream, {
      mimeType,
      audioBitsPerSecond: 128000
    });

    // Set up MediaRecorder event handlers
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onerror = (error) => {
      console.error('MediaRecorder error:', error);
    };

    // Initialize VAD
    this.vadService = new VADService(audioStream, this.options.vadOptions);
    
    // Start VAD with speech event handlers
    this.vadService.start(
      () => this.onSpeechStart(),
      () => this.onSpeechEnd()
    );

    // Start recording
    this.mediaRecorder.start(1000); // Collect data every second
    this.isRecording = true;
    
    console.log('Realtime recording started');
  }

  /**
   * Stop realtime recording
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    // Stop VAD
    if (this.vadService) {
      this.vadService.stop();
      this.vadService = null;
    }

    // Stop MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      
      // Process any remaining audio
      if (this.audioChunks.length > 0) {
        await this.processSegment();
      }
    }

    // Clear timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = undefined;
    }

    this.mediaRecorder = null;
    this.isRecording = false;
    this.audioChunks = [];
    
    console.log('Realtime recording stopped');
  }

  /**
   * Handle speech start event
   */
  private onSpeechStart(): void {
    console.log('Speech started');
    this.isSpeaking = true;
    
    // Clear any pending silence timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = undefined;
    }
  }

  /**
   * Handle speech end event
   */
  private onSpeechEnd(): void {
    console.log('Speech ended');
    this.isSpeaking = false;
    
    // Set a timeout to process the segment after a brief silence
    this.silenceTimeout = setTimeout(() => {
      this.checkAndProcessSegment();
    }, 1500); // Wait 1.5 seconds of silence before processing
  }

  /**
   * Check if segment meets criteria and process it
   */
  private async checkAndProcessSegment(): Promise<void> {
    const segmentDuration = (Date.now() - this.segmentStartTime) / 1000;
    
    // Check minimum duration
    if (segmentDuration >= this.options.minSegmentDuration) {
      await this.processSegment();
    } else {
      console.log(`Segment too short (${segmentDuration.toFixed(1)}s), waiting for more audio`);
    }
    
    // Force process if maximum duration reached
    if (segmentDuration >= this.options.maxSegmentDuration) {
      await this.processSegment();
    }
  }

  /**
   * Process accumulated audio segment
   */
  private async processSegment(): Promise<void> {
    if (this.audioChunks.length === 0) {
      return;
    }

    console.log('Processing audio segment...');
    
    try {
      // Create blob from chunks
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      
      // Convert blob to buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Transcribe the audio
      const result = await this.whisperService.transcribeBuffer(buffer);
      
      // Send result to callback
      if (this.onTranscriptionCallback && result.text.trim()) {
        this.onTranscriptionCallback(result);
      }
      
      // Reset for next segment
      this.audioChunks = [];
      this.segmentStartTime = Date.now();
      
    } catch (error) {
      console.error('Error processing segment:', error);
    }
  }

  /**
   * Get supported MIME type for MediaRecorder
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`Using MIME type: ${type}`);
        return type;
      }
    }

    throw new Error('No supported audio MIME type found');
  }

  /**
   * Get current recording state
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get current speaking state
   */
  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }
}