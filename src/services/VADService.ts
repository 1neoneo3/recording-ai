import hark from 'hark';

export interface VADOptions {
  threshold?: number;
  interval?: number;
  history?: number;
  smoothing?: number;
}

export class VADService {
  private speechEvents: any;
  private isListening: boolean = false;
  private onSpeechStart?: () => void;
  private onSpeechEnd?: () => void;

  constructor(
    private audioStream: MediaStream,
    private options: VADOptions = {}
  ) {
    const defaultOptions = {
      threshold: -50, // dB threshold for speech detection
      interval: 50,   // how often to check audio level (ms)
      history: 10,    // how many previous intervals to remember
      smoothing: 0.1  // audio level smoothing
    };
    
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Start voice activity detection
   */
  start(
    onSpeechStart: () => void,
    onSpeechEnd: () => void
  ): void {
    if (this.isListening) {
      console.warn('VAD is already listening');
      return;
    }

    this.onSpeechStart = onSpeechStart;
    this.onSpeechEnd = onSpeechEnd;

    // Initialize hark with the audio stream
    this.speechEvents = hark(this.audioStream, this.options);

    // Set up event listeners
    this.speechEvents.on('speaking', () => {
      console.log('Speech detected - started speaking');
      if (this.onSpeechStart) {
        this.onSpeechStart();
      }
    });

    this.speechEvents.on('stopped_speaking', () => {
      console.log('Speech stopped');
      if (this.onSpeechEnd) {
        this.onSpeechEnd();
      }
    });

    this.speechEvents.on('volume_change', (volume: number, threshold: number) => {
      // Optional: monitor volume levels for debugging
      // console.log(`Volume: ${volume.toFixed(2)} dB, Threshold: ${threshold.toFixed(2)} dB`);
    });

    this.isListening = true;
    console.log('VAD started listening');
  }

  /**
   * Stop voice activity detection
   */
  stop(): void {
    if (!this.isListening || !this.speechEvents) {
      return;
    }

    this.speechEvents.stop();
    this.isListening = false;
    console.log('VAD stopped listening');
  }

  /**
   * Get current listening state
   */
  getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Update threshold dynamically
   */
  setThreshold(threshold: number): void {
    if (this.speechEvents) {
      this.speechEvents.setThreshold(threshold);
    }
    this.options.threshold = threshold;
  }
}