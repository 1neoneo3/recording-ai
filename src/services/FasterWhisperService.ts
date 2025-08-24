import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { TranscriptionResult } from '../types/index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FasterWhisperService {
  private pythonPath: string = 'uv run python';
  private daemonPath: string;
  private daemon: ChildProcess | null = null;
  private isReady: boolean = false;
  private requestQueue: Array<{
    request: string;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor() {
    this.daemonPath = path.join(__dirname, '../python/whisper_daemon.py');
    this.startDaemon();
  }

  /**
   * Start the whisper daemon process
   */
  private startDaemon(): void {
    console.log('Starting Whisper daemon...');
    
    try {
      this.daemon = spawn('uv', ['run', 'python', this.daemonPath], {
        cwd: '/home/mk/workspace/voice-recognition-app',
        env: { ...process.env, VIRTUAL_ENV: undefined },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderrBuffer = '';
      let stdoutBuffer = '';

      this.daemon.stderr?.on('data', (data) => {
        const message = data.toString();
        stderrBuffer += message;
        console.log('[Whisper Daemon]', message.trim());
        
        // Check for ready signal
        if (message.includes('Whisper Daemon ready for requests')) {
          this.isReady = true;
          console.log('Whisper daemon is ready');
        }
      });

      this.daemon.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;
        
        // Process complete JSON responses
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || ''; // Keep incomplete line
        
        for (const line of lines) {
          if (line.trim()) {
            this.handleResponse(line.trim());
          }
        }
      });

      this.daemon.on('error', (error) => {
        console.error('Whisper daemon error:', error);
        this.isReady = false;
      });

      this.daemon.on('exit', (code, signal) => {
        console.log(`Whisper daemon exited with code ${code}, signal ${signal}`);
        this.isReady = false;
        this.daemon = null;
        
        // Restart daemon after a delay
        setTimeout(() => {
          console.log('Restarting Whisper daemon...');
          this.startDaemon();
        }, 5000);
      });

    } catch (error) {
      console.error('Failed to start Whisper daemon:', error);
    }
  }

  /**
   * Handle JSON response from daemon
   */
  private handleResponse(response: string): void {
    try {
      const result = JSON.parse(response);
      
      // Process the first item in queue
      if (this.requestQueue.length > 0) {
        const { resolve } = this.requestQueue.shift()!;
        resolve(result);
      }
    } catch (error) {
      console.error('Failed to parse daemon response:', error);
      if (this.requestQueue.length > 0) {
        const { reject } = this.requestQueue.shift()!;
        reject(new Error('Invalid JSON response from daemon'));
      }
    }
  }

  /**
   * Send request to daemon and wait for response
   */
  private async sendRequest(audioPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.daemon || !this.isReady) {
        reject(new Error('Whisper daemon not ready'));
        return;
      }

      // Add to queue
      this.requestQueue.push({ request: audioPath, resolve, reject });
      
      // Send request
      const request = JSON.stringify({ audio_path: audioPath }) + '\n';
      this.daemon.stdin?.write(request);
      
      // Set timeout
      setTimeout(() => {
        const queueIndex = this.requestQueue.findIndex(item => item.request === audioPath);
        if (queueIndex !== -1) {
          this.requestQueue.splice(queueIndex, 1);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Check if daemon is ready and dependencies are available
   */
  async checkDependencies(): Promise<{
    python: boolean;
    faster_whisper: boolean;
    torch: boolean;
    cuda_available: boolean;
  }> {
    return {
      python: this.daemon !== null,
      faster_whisper: this.isReady,
      torch: this.isReady,
      cuda_available: this.isReady
    };
  }

  /**
   * Install faster-whisper dependencies
   */
  async installDependencies(): Promise<void> {
    console.log('Installing faster-whisper dependencies...');
    return new Promise((resolve, reject) => {
      const process = spawn('pip', ['install', 'faster-whisper'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      process.on('close', (code) => {
        if (code === 0) {
          console.log('faster-whisper installed successfully');
          resolve();
        } else {
          reject(new Error(`pip install failed with code ${code}`));
        }
      });

      process.on('error', (error) => {
        console.error('Failed to install faster-whisper:', error);
        reject(error);
      });
    });
  }

  /**
   * Transcribe audio file using the daemon
   */
  async transcribeFile(
    filePath: string, 
    modelName: string = 'base',
    device: string = 'cpu',
    computeType: string = 'auto'
  ): Promise<TranscriptionResult> {
    try {
      // Map model names from UI to faster-whisper model names
      const modelMap: { [key: string]: string } = {
        'faster-whisper/tiny': 'tiny',
        'faster-whisper/base': 'base',
        'faster-whisper/small': 'small',
        'faster-whisper/medium': 'medium',
        'faster-whisper/large-v2': 'large-v2',
        'faster-whisper/large-v3': 'large-v3'
      };

      const mappedModel = modelMap[modelName] || modelName;
      
      console.log(`Transcribing with daemon model: ${mappedModel}, device: ${device}`);
      
      // Wait for daemon to be ready
      let retries = 0;
      while (!this.isReady && retries < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      if (!this.isReady) {
        throw new Error('Whisper daemon not ready after waiting');
      }
      
      // Send transcription request
      const result = await this.sendRequest(filePath);
      
      if (result.error) {
        throw new Error(result.error);
      }

      return {
        text: result.text || '',
        confidence: result.language_probability || 0,
        language: result.language || 'ja',
        processingTime: result.transcribe_time || 0, // No load time with daemon
        metadata: {
          model: result.model,
          device: result.device,
          computeType: result.compute_type,
          loadTime: 0, // Model already loaded
          transcribeTime: result.transcribe_time,
          segments: result.segments,
          duration: result.duration
        }
      };
    } catch (error) {
      console.error('Daemon transcription failed:', error);
      
      // Check if it's a missing dependency error
      if (error instanceof Error && error.message.includes('not installed')) {
        throw new Error('faster-whisper is not installed. Please run: pip install faster-whisper');
      }
      
      throw error;
    }
  }

  /**
   * Cleanup daemon on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.daemon) {
      console.log('Shutting down Whisper daemon...');
      this.daemon.kill('SIGTERM');
      this.daemon = null;
      this.isReady = false;
    }
  }
}