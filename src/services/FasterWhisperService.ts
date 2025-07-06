import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { TranscriptionResult } from '../types/index.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FasterWhisperService {
  private pythonPath: string = 'python3';
  private scriptPath: string;

  constructor() {
    this.scriptPath = path.join(__dirname, '../python/faster_whisper_transcribe.py');
  }

  /**
   * Check if faster-whisper dependencies are installed
   */
  async checkDependencies(): Promise<{
    python: boolean;
    faster_whisper: boolean;
    torch: boolean;
    cuda_available: boolean;
  }> {
    try {
      const { stdout } = await execAsync(`${this.pythonPath} "${this.scriptPath}" --check-deps`);
      const deps = JSON.parse(stdout);
      return {
        python: true,
        faster_whisper: deps.faster_whisper || false,
        torch: deps.torch || false,
        cuda_available: deps.cuda_available || false
      };
    } catch (error) {
      console.error('Failed to check dependencies:', error);
      return {
        python: false,
        faster_whisper: false,
        torch: false,
        cuda_available: false
      };
    }
  }

  /**
   * Install faster-whisper dependencies
   */
  async installDependencies(): Promise<void> {
    console.log('Installing faster-whisper dependencies...');
    try {
      await execAsync('pip install faster-whisper');
      console.log('faster-whisper installed successfully');
    } catch (error) {
      console.error('Failed to install faster-whisper:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio file using faster-whisper
   */
  async transcribeFile(
    filePath: string, 
    modelName: string = 'base',
    device: string = 'auto',
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
      
      console.log(`Transcribing with faster-whisper model: ${mappedModel}, device: ${device}`);
      
      const command = `${this.pythonPath} "${this.scriptPath}" "${filePath}" --model ${mappedModel} --device ${device} --compute-type ${computeType}`;
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      if (stderr && !stderr.includes('UserWarning')) {
        console.warn('faster-whisper warnings:', stderr);
      }

      // Clean stdout to remove any non-JSON content (e.g., Intel MKL warnings)
      let cleanedStdout = stdout;
      
      // Find the first '{' character (start of JSON)
      const jsonStart = stdout.indexOf('{');
      if (jsonStart > 0) {
        // Extract only the JSON part
        cleanedStdout = stdout.substring(jsonStart);
        console.log('Removed non-JSON prefix from stdout');
      }
      
      // Also check for any trailing content after the last '}'
      const jsonEnd = cleanedStdout.lastIndexOf('}');
      if (jsonEnd > -1 && jsonEnd < cleanedStdout.length - 1) {
        cleanedStdout = cleanedStdout.substring(0, jsonEnd + 1);
      }

      const result = JSON.parse(cleanedStdout);
      
      if (result.error) {
        throw new Error(result.error);
      }

      return {
        text: result.text || '',
        confidence: result.language_probability || 0,
        language: result.language || 'ja',
        processingTime: (result.load_time || 0) + (result.transcribe_time || 0),
        metadata: {
          model: result.model,
          device: result.device,
          computeType: result.compute_type,
          loadTime: result.load_time,
          transcribeTime: result.transcribe_time,
          segments: result.segments,
          duration: result.duration
        }
      };
    } catch (error) {
      console.error('faster-whisper transcription failed:', error);
      
      // Check if it's a missing dependency error
      if (error instanceof Error && error.message.includes('not installed')) {
        throw new Error('faster-whisper is not installed. Please run: pip install faster-whisper');
      }
      
      throw error;
    }
  }
}