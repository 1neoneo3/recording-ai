import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { RecordingConfig, AudioFile, RecordingSession } from '../types/index.js';

export class SystemAudioRecorder {
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
   * Check available audio devices
   */
  async getAvailableDevices(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
      
      let devices: string[] = [];
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        let inAudioSection = false;
        for (const line of lines) {
          if (line.includes('AVFoundation audio devices:')) {
            inAudioSection = true;
            continue;
          }
          if (inAudioSection && line.includes('[')) {
            const match = line.match(/\[(\d+)\]\s+(.+)/);
            if (match) {
              devices.push(`${match[1]}: ${match[2]}`);
            }
          }
        }
      });
      
      ffmpeg.on('close', () => {
        resolve(devices);
      });
      
      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Start recording system audio
   * @param deviceIndex - Audio device index (default: 0 for BlackHole)
   * @param config - Recording configuration
   */
  async startSystemAudioRecording(
    deviceIndex: number = 0,
    config: RecordingConfig = {
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav'
    }
  ): Promise<RecordingSession> {
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

    // FFmpeg args for system audio recording via BlackHole
    const ffmpegArgs = [
      '-f', 'avfoundation',
      '-i', `:${deviceIndex}`, // Audio device index
      '-ar', config.sampleRate.toString(),
      '-ac', config.channels.toString(),
      '-c:a', 'pcm_s16le',
      '-y', // Overwrite output file
      outputPath
    ];

    console.log(`Starting system audio recording with device ${deviceIndex}...`);
    
    this.recordingProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.recordingProcess.on('error', (error) => {
      console.error('System audio recording error:', error);
      if (this.currentSession) {
        this.currentSession.status = 'error';
      }
    });

    this.recordingProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Error') || output.includes('error')) {
        console.error('FFmpeg error:', output);
      }
    });

    console.log(`System audio recording started: ${sessionId}`);
    return this.currentSession;
  }

  /**
   * Start recording microphone input
   */
  async startMicrophoneRecording(
    config: RecordingConfig = {
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav'
    }
  ): Promise<RecordingSession> {
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

    // Find microphone device
    const devices = await this.getAvailableDevices();
    const micDevice = devices.find(device => 
      device.toLowerCase().includes('mic') || 
      device.toLowerCase().includes('マイク')
    );
    
    if (!micDevice) {
      throw new Error('No microphone device found');
    }

    const micIndex = micDevice.split(':')[0];

    const ffmpegArgs = [
      '-f', 'avfoundation',
      '-i', `:${micIndex}`, // Microphone device
      '-ar', config.sampleRate.toString(),
      '-ac', config.channels.toString(),
      '-c:a', 'pcm_s16le',
      '-y',
      outputPath
    ];

    console.log(`Starting microphone recording with device ${micIndex}...`);
    
    this.recordingProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.recordingProcess.on('error', (error) => {
      console.error('Microphone recording error:', error);
      if (this.currentSession) {
        this.currentSession.status = 'error';
      }
    });

    console.log(`Microphone recording started: ${sessionId}`);
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

          console.log(`Audio file saved: ${outputPath} (${stats.size} bytes)`);
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

  /**
   * Get recording duration in seconds
   */
  getRecordingDuration(): number {
    if (!this.currentSession) return 0;
    const now = new Date();
    return Math.floor((now.getTime() - this.currentSession.startTime.getTime()) / 1000);
  }
}