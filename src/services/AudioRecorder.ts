import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { RecordingConfig, AudioFile, RecordingSession } from '../types/index.js';

export class AudioRecorder {
  private recordingProcess: ChildProcess | null = null;
  private currentSession: RecordingSession | null = null;
  private outputDir: string;

  constructor(outputDir: string = './recordings') {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private getOutputPath(sessionId: string): string {
    return path.join(this.outputDir, `${sessionId}.wav`);
  }

  /**
   * Start recording system audio using BlackHole virtual audio driver
   * Note: BlackHole must be installed and configured as default audio device
   */
  async startRecording(config: RecordingConfig = {
    sampleRate: 16000,
    channels: 1,
    audioType: 'wav'
  }): Promise<RecordingSession> {
    if (this.recordingProcess) {
      throw new Error('Recording already in progress');
    }

    const sessionId = this.generateSessionId();
    const outputPath = this.getOutputPath(sessionId);

    this.currentSession = {
      id: sessionId,
      startTime: new Date(),
      status: 'recording'
    };

    // Use ffmpeg to record from default audio device (BlackHole)
    const ffmpegArgs = [
      '-f', 'avfoundation',
      '-i', ':0', // Use default audio device
      '-ar', config.sampleRate.toString(),
      '-ac', config.channels.toString(),
      '-c:a', 'pcm_s16le',
      '-y', // Overwrite output file
      outputPath
    ];

    this.recordingProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.recordingProcess.on('error', (error) => {
      console.error('Recording error:', error);
      if (this.currentSession) {
        this.currentSession.status = 'error';
      }
    });

    console.log(`Recording started: ${sessionId}`);
    return this.currentSession;
  }

  /**
   * Stop the current recording
   */
  async stopRecording(): Promise<AudioFile | null> {
    if (!this.recordingProcess || !this.currentSession) {
      throw new Error('No recording in progress');
    }

    return new Promise((resolve, reject) => {
      if (!this.recordingProcess || !this.currentSession) {
        reject(new Error('No recording in progress'));
        return;
      }

      const outputPath = this.getOutputPath(this.currentSession.id);
      
      // Send SIGINT to gracefully stop ffmpeg
      this.recordingProcess.kill('SIGINT');

      this.recordingProcess.on('exit', (code) => {
        console.log(`Recording stopped with code: ${code}`);
        
        if (this.currentSession) {
          this.currentSession.endTime = new Date();
          this.currentSession.status = 'completed';
        }

        // Check if file was created and get its info
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          const audioFile: AudioFile = {
            path: outputPath,
            duration: 0, // Will be calculated later if needed
            size: stats.size,
            format: 'wav',
            sampleRate: 16000,
            channels: 1
          };

          if (this.currentSession) {
            this.currentSession.audioFile = audioFile;
          }

          resolve(audioFile);
        } else {
          reject(new Error('Recording file not found'));
        }

        this.recordingProcess = null;
        this.currentSession = null;
      });
    });
  }

  /**
   * Get current recording session
   */
  getCurrentSession(): RecordingSession | null {
    return this.currentSession;
  }

  /**
   * Check if recording is in progress
   */
  isRecording(): boolean {
    return this.recordingProcess !== null;
  }
}