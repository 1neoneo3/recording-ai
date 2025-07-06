import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { RecordingConfig, AudioFile, RecordingSession } from '../types/index.js';

export class AudioRecorder {
  private recordingProcess: ChildProcess | null = null;
  private currentSession: RecordingSession | null = null;
  private outputDir: string;
  private onStopCallback?: (sessionId: string) => Promise<void>;

  constructor(outputDir: string = './recordings') {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  setStopCallback(callback: (sessionId: string) => Promise<void>) {
    this.onStopCallback = callback;
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
      '-i', ':1', // Use MacBook Air microphone
      '-ar', config.sampleRate.toString(),
      '-ac', config.channels.toString(),
      '-c:a', 'pcm_s16le',
      '-filter:a', 'volume=10', // Increase volume by 10x
      '-y' // Overwrite output file
    ];

    // Add duration if specified
    if (config.duration) {
      ffmpegArgs.push('-t', config.duration.toString());
    }

    ffmpegArgs.push(outputPath);

    console.log('Starting ffmpeg with args:', ffmpegArgs);
    console.log('Output path:', outputPath);

    try {
      this.recordingProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      console.error('Failed to spawn ffmpeg process:', error);
      throw new Error(`Failed to start recording: ${error}`);
    }

    this.recordingProcess.on('error', (error) => {
      console.error('Recording process error:', error);
      if (this.currentSession) {
        this.currentSession.status = 'error';
      }
    });

    this.recordingProcess.stderr?.on('data', (data) => {
      console.log('ffmpeg stderr:', data.toString());
    });

    this.recordingProcess.stdout?.on('data', (data) => {
      console.log('ffmpeg stdout:', data.toString());
    });

    // Auto-stop recording if duration is specified
    if (config.duration) {
      setTimeout(async () => {
        if (this.recordingProcess && this.currentSession) {
          const sessionId = this.currentSession.id;
          await this.stopRecording();
          // Call callback for auto transcription
          if (this.onStopCallback) {
            await this.onStopCallback(sessionId);
          }
        }
      }, config.duration * 1000);
    }

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

    const outputPath = this.getOutputPath(this.currentSession.id);
    const process = this.recordingProcess;
    const sessionId = this.currentSession.id;
    
    console.log(`Stopping recording for session: ${sessionId}`);
    console.log(`Expected output path: ${outputPath}`);

    return new Promise((resolve, reject) => {
      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.error('Recording stop timeout after 10 seconds');
        reject(new Error('Recording stop timeout'));
      }, 10000);

      const onExit = (code: number | null) => {
        clearTimeout(timeout);
        console.log(`ffmpeg process exited with code: ${code}`);
        console.log(`Checking for output file: ${outputPath}`);
        
        // Wait a moment for file system to sync
        setTimeout(() => {
          if (fs.existsSync(outputPath)) {
            console.log(`Recording file created successfully: ${outputPath}`);
            const stats = fs.statSync(outputPath);
            console.log(`File size: ${stats.size} bytes`);
            
            const audioFile: AudioFile = {
              path: outputPath,
              duration: 0,
              size: stats.size,
              format: 'wav',
              sampleRate: 16000,
              channels: 1
            };

            if (this.currentSession) {
              this.currentSession.endTime = new Date();
              this.currentSession.status = 'completed';
              this.currentSession.audioFile = audioFile;
            }

            this.recordingProcess = null;
            this.currentSession = null;
            resolve(audioFile);
          } else {
            console.error(`Recording file not found at: ${outputPath}`);
            // List files in output directory for debugging
            if (fs.existsSync(this.outputDir)) {
              const files = fs.readdirSync(this.outputDir);
              console.log('Files in output directory:', files);
            }
            
            this.recordingProcess = null;
            this.currentSession = null;
            reject(new Error(`Recording file not found at: ${outputPath}`));
          }
        }, 500); // Wait 500ms for file system
      };

      const onError = (error: Error) => {
        clearTimeout(timeout);
        console.error('ffmpeg process error during stop:', error);
        this.recordingProcess = null;
        this.currentSession = null;
        reject(error);
      };

      // Add event handlers
      process.once('exit', onExit);
      process.once('error', onError);
      
      // Send SIGINT to gracefully stop ffmpeg
      console.log('Sending SIGINT to ffmpeg process...');
      process.kill('SIGINT');
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