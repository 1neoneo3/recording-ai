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
      let rawAudioData = wav.getSamples();
      
      // Handle multi-channel audio (take first channel if stereo)
      if (Array.isArray(rawAudioData)) {
        rawAudioData = rawAudioData[0];
      }
      
      // Convert to Float32Array
      const audioData = new Float32Array(rawAudioData);
      
      // Check if audio is long (> 5 minutes = 300 seconds)
      const sampleRate = 16000;
      const durationSeconds = audioData.length / sampleRate;
      
      let transcriptionResult: TranscriptionResult;
      
      if (durationSeconds > 60) {
        console.log(`Long audio detected (${Math.round(durationSeconds)}s), using chunked processing`);
        transcriptionResult = await this.transcribeInChunks(audioData);
      } else {
        console.log(`Short audio (${Math.round(durationSeconds)}s), using single processing`);
        
        // For audio longer than 30 seconds, specify chunk_length_s parameter
        const options: any = durationSeconds > 30 ? {
          chunk_length_s: 30,
          stride_length_s: 5,
          language: 'japanese',
          task: 'transcribe'
        } : {
          language: 'japanese',
          task: 'transcribe'
        };
        
        // Transcribe using audio data directly
        const result = await this.transcriber(audioData, options);
        
        let finalText = result.text || '[BLANK_AUDIO]';
        
        // Apply repetition detection and cleanup for single processing too
        if (finalText && finalText !== '[BLANK_AUDIO]') {
          if (this.isRepetitiveText(finalText)) {
            console.log('Detected repetitive text in single processing, applying cleanup');
            finalText = this.cleanFinalText(finalText);
          }
        }
        
        transcriptionResult = {
          text: finalText,
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
      }

      console.log('Transcription completed:', transcriptionResult.text);
      
      // Save transcription to text file
      await this.saveTranscriptionToFile(audioFile.path, transcriptionResult);
      
      return transcriptionResult;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error}`);
    }
  }

  /**
   * Transcribe long audio in chunks
   */
  private async transcribeInChunks(audioData: Float32Array): Promise<TranscriptionResult> {
    const sampleRate = 16000;
    const chunkDurationSeconds = 120; // 2 minutes per chunk
    const chunkSize = chunkDurationSeconds * sampleRate;
    const overlapSeconds = 5; // 5 seconds overlap
    const overlapSize = overlapSeconds * sampleRate;
    
    let allText = '';
    let allSegments: any[] = [];
    let currentOffset = 0;
    let previousChunkText = '';
    
    const totalChunks = Math.ceil(audioData.length / (chunkSize - overlapSize));
    console.log(`Processing ${totalChunks} chunks...`);
    
    for (let start = 0; start < audioData.length; start += (chunkSize - overlapSize)) {
      const end = Math.min(start + chunkSize, audioData.length);
      const chunk = audioData.slice(start, end);
      
      // Skip chunks shorter than 1 second to reduce hallucinations
      const chunkDurationSec = chunk.length / sampleRate;
      if (chunkDurationSec < 1) {
        console.log(`Skipping very short chunk (${chunkDurationSec.toFixed(1)}s)`);
        continue;
      }
      
      const chunkNumber = Math.floor(start / (chunkSize - overlapSize)) + 1;
      
      console.log(`Processing chunk ${chunkNumber}/${totalChunks} (${Math.round(start/sampleRate)}s - ${Math.round(end/sampleRate)}s)`);
      
      try {
        // For long audio chunks, specify chunk_length_s parameter
        const chunkOptions: any = chunkDurationSec > 30 ? {
          chunk_length_s: 30,
          stride_length_s: 5,
          language: 'japanese',
          task: 'transcribe'
        } : {
          language: 'japanese',
          task: 'transcribe'
        };
        
        const result = await this.transcriber(chunk, chunkOptions);
        console.log(`Raw result for chunk ${chunkNumber}:`, JSON.stringify(result.text));
        
        if (result.text && result.text.trim() !== '') {
          let chunkText = result.text.trim();
          console.log(`Original chunk text: "${chunkText}"`);
          
          // Advanced deduplication
          if (previousChunkText && start > 0) {
            const beforeDedup = chunkText;
            chunkText = this.removeRepetitiveText(chunkText, previousChunkText);
            console.log(`After deduplication: "${beforeDedup}" -> "${chunkText}"`);
          }
          
          // Skip if chunk text is mostly repetitive (more lenient)
          const isRepetitive = this.isRepetitiveText(chunkText);
          console.log(`Is repetitive: ${isRepetitive}, length: ${chunkText.length}`);
          if (isRepetitive && chunkText.length < 20) {
            console.log(`Skipping repetitive chunk: ${chunkText.substring(0, 50)}...`);
            continue;
          }
          
          allText += (allText ? ' ' : '') + chunkText;
          previousChunkText = chunkText;
          
          if (result.chunks && result.chunks.length > 0) {
            const adjustedChunks = result.chunks.map((chunk: any) => ({
              start: (chunk.timestamp?.[0] || 0) + currentOffset,
              end: (chunk.timestamp?.[1] || 0) + currentOffset,
              text: chunk.text || '',
              confidence: chunk.confidence || 1
            }));
            allSegments.push(...adjustedChunks);
          }
        }
        
        currentOffset = start / sampleRate;
        
        // Add small delay to prevent memory issues
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error processing chunk ${chunkNumber}:`, error);
        allText += ' [CHUNK_ERROR]';
      }
    }
    
    // Final cleanup - remove any remaining repetitive patterns
    const cleanedText = this.cleanFinalText(allText);
    
    const transcriptionResult: TranscriptionResult = {
      text: cleanedText || '[BLANK_AUDIO]',
      confidence: 1,
      language: 'unknown',
      segments: allSegments
    };

    console.log(`Chunked transcription completed. Total text length: ${cleanedText.length} characters`);
    
    return transcriptionResult;
  }

  /**
   * Check if text is mostly repetitive
   */
  private isRepetitiveText(text: string): boolean {
    if (!text || text.length < 20) return false;
    
    const words = text.split(/\s+/);
    if (words.length < 5) return false;
    
    // Count word frequency
    const wordCount = new Map<string, number>();
    for (const word of words) {
      const lowerWord = word.toLowerCase().replace(/[^\w]/g, '');
      if (lowerWord.length > 2) { // Only count words longer than 2 characters
        wordCount.set(lowerWord, (wordCount.get(lowerWord) || 0) + 1);
      }
    }
    
    // Check if any word appears more than 40% of the time
    const totalWords = words.filter(w => w.replace(/[^\w]/g, '').length > 2).length;
    for (const count of wordCount.values()) {
      if (count / totalWords > 0.4) {
        return true;
      }
    }
    
    // Check for consecutive repetitions
    const phrases = text.split(/[.!?。！？]\s*/);
    if (phrases.length >= 3) {
      let repetitiveCount = 0;
      for (let i = 1; i < phrases.length; i++) {
        if (this.calculateSimilarity(phrases[i], phrases[i-1]) > 0.8) {
          repetitiveCount++;
        }
      }
      if (repetitiveCount / phrases.length > 0.6) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Remove repetitive text based on previous chunk
   */
  private removeRepetitiveText(currentText: string, previousText: string): string {
    if (!currentText || !previousText) return currentText;
    
    const currentWords = currentText.split(/\s+/);
    const previousWords = previousText.split(/\s+/);
    
    // Find overlap at the beginning of current text
    let overlapEnd = 0;
    const maxOverlap = Math.min(currentWords.length / 2, previousWords.length / 2, 10);
    
    for (let i = 1; i <= maxOverlap; i++) {
      const currentStart = currentWords.slice(0, i).join(' ').toLowerCase();
      const previousEnd = previousWords.slice(-i).join(' ').toLowerCase();
      
      if (this.calculateSimilarity(currentStart, previousEnd) > 0.7) {
        overlapEnd = i;
      }
    }
    
    // Remove overlap
    if (overlapEnd > 0) {
      return currentWords.slice(overlapEnd).join(' ');
    }
    
    return currentText;
  }

  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Final text cleanup to remove remaining repetitive patterns
   */
  private cleanFinalText(text: string): string {
    if (!text || text.trim() === '') return text;
    
    let cleaned = text;
    
    // Remove patterns like "字幕は、字幕は、字幕は、" (same word/phrase repeated with punctuation)
    cleaned = cleaned.replace(/(\b[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+[、。，．,.])\s*(\1\s*){3,}/g, '$1');
    
    // Remove excessive repetitions of the same phrase (3+ times) - more general pattern
    cleaned = cleaned.replace(/(\b.{1,20}[、。，．,.])\s*(\1\s*){2,}/g, '$1');
    
    // Remove excessive word repetitions within sentences
    cleaned = cleaned.replace(/\b(\w+)(\s+\1){4,}/gi, '$1'); // Remove words repeated 5+ times
    
    // Remove patterns like "(word、word、word、)" with parentheses
    cleaned = cleaned.replace(/\([^)]*(\b[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+[、。，．,.]\s*){5,}[^)]*\)/g, '');
    
    // Split by sentences for similarity-based deduplication
    const sentences = cleaned.split(/[.!?。！？]\s*/);
    const uniqueSentences: string[] = [];
    let consecutiveCount = 1;
    let lastSentence = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;
      
      if (this.calculateSimilarity(trimmedSentence, lastSentence) > 0.8) {
        consecutiveCount++;
        if (consecutiveCount <= 2) { // Allow up to 2 similar sentences
          uniqueSentences.push(trimmedSentence);
        }
      } else {
        consecutiveCount = 1;
        uniqueSentences.push(trimmedSentence);
      }
      lastSentence = trimmedSentence;
    }
    
    cleaned = uniqueSentences.join('. ');
    
    // Clean up multiple spaces and punctuation
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/([.!?。！？])\1+/g, '$1');
    
    return cleaned.trim();
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