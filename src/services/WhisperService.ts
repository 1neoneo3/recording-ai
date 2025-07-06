import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import pkg from 'wavefile';
const { WaveFile } = pkg;
import { TranscriptionResult, AudioFile } from '../types/index.js';

export class WhisperService {
  private transcriber: any = null;
  private modelLoaded = false;
  private outputDir: string;

  constructor(private modelName: string = 'Xenova/whisper-medium', outputDir: string = './data/transcriptions') {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Initialize Whisper model
   */
  async initialize(): Promise<void> {
    if (this.modelLoaded) return;

    console.log('Loading Whisper model...');
    try {
      this.transcriber = await pipeline('automatic-speech-recognition', this.modelName);
      this.modelLoaded = true;
      console.log('Whisper model loaded successfully');
    } catch (error) {
      console.error('Failed to load Whisper model:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio file
   */
  async transcribeFile(audioFile: AudioFile): Promise<TranscriptionResult> {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    if (!fs.existsSync(audioFile.path)) {
      throw new Error(`Audio file not found: ${audioFile.path}`);
    }

    console.log(`Transcribing audio file: ${audioFile.path}`);
    
    try {
      // Read audio file as buffer
      const audioBuffer = fs.readFileSync(audioFile.path);
      
      // Load audio using wavefile
      const wav = new WaveFile(audioBuffer);
      
      // Convert to Float32Array and set proper sample rate
      wav.toBitDepth('32f');
      wav.toSampleRate(16000);
      
      // Get audio samples
      let audioData = wav.getSamples();
      
      // Handle multi-channel audio (take first channel if stereo)
      if (Array.isArray(audioData)) {
        audioData = audioData[0];
      }
      
      // Transcribe using audio data directly
      const result = await this.transcriber(audioData);
      
      const transcriptionResult: TranscriptionResult = {
        text: result.text,
        confidence: result.confidence || 1.0,
        language: result.language || 'unknown'
      };

      // If chunks/segments are available, include them
      if (result.chunks && Array.isArray(result.chunks)) {
        transcriptionResult.segments = result.chunks.map((chunk: any) => ({
          start: chunk.timestamp?.[0] || 0,
          end: chunk.timestamp?.[1] || 0,
          text: chunk.text,
          confidence: chunk.confidence
        }));
      }

      console.log('Transcription completed:', result.text);
      
      // Save transcription to text file
      await this.saveTranscriptionToFile(audioFile.path, transcriptionResult);
      
      return transcriptionResult;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error}`);
    }
  }

  /**
   * Transcribe audio buffer directly
   */
  async transcribeBuffer(audioBuffer: Buffer): Promise<TranscriptionResult> {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    try {
      const result = await this.transcriber(audioBuffer);
      
      return {
        text: result.text,
        confidence: result.confidence,
        language: result.language || 'unknown'
      };
    } catch (error) {
      console.error('Buffer transcription error:', error);
      throw new Error(`Buffer transcription failed: ${error}`);
    }
  }

  /**
   * Get available models
   */
  static getAvailableModels(): string[] {
    return [
      'Xenova/whisper-tiny',
      'Xenova/whisper-base',
      'Xenova/whisper-small',
      'Xenova/whisper-medium',
      'Xenova/whisper-large-v2',
      'Xenova/whisper-large-v3'
    ];
  }

  /**
   * Save transcription result to text file
   */
  private async saveTranscriptionToFile(audioFilePath: string, result: TranscriptionResult): Promise<string> {
    try {
      const audioFileName = path.basename(audioFilePath, path.extname(audioFilePath));
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const textFileName = `${audioFileName}_${timestamp}.txt`;
      const textFilePath = path.join(this.outputDir, textFileName);

      let content = `Transcription Result\n`;
      content += `==================\n`;
      content += `Audio File: ${audioFilePath}\n`;
      content += `Timestamp: ${new Date().toISOString()}\n`;
      content += `Language: ${result.language}\n`;
      content += `Confidence: ${result.confidence}\n`;
      content += `\nTranscription:\n`;
      content += `${result.text}\n`;

      if (result.segments && result.segments.length > 0) {
        content += `\nSegments:\n`;
        content += `=========\n`;
        result.segments.forEach((segment, index) => {
          content += `[${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s] ${segment.text}\n`;
        });
      }

      await fs.promises.writeFile(textFilePath, content, 'utf8');
      console.log(`Transcription saved to: ${textFilePath}`);
      
      return textFilePath;
    } catch (error) {
      console.error('Failed to save transcription file:', error);
      throw error;
    }
  }

  /**
   * Check if model is loaded
   */
  isModelLoaded(): boolean {
    return this.modelLoaded;
  }
}