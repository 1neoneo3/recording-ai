import { spawn } from 'child_process';
import { TranscriptionResult } from '../types/index.js';
import fs from 'fs';
import path from 'path';

export class WhisperPythonService {
  private pythonPath: string = 'python3';
  private outputDir: string;
  private dependenciesCache: { python: boolean; whisper: boolean } | null = null;

  constructor(outputDir: string = './data/transcriptions') {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Check if Python and Whisper are installed
   */
  async checkDependencies(): Promise<{ python: boolean; whisper: boolean }> {
    // Return cached result if available
    if (this.dependenciesCache !== null) {
      return this.dependenciesCache;
    }

    const checkPython = new Promise<boolean>((resolve) => {
      const python = spawn(this.pythonPath, ['--version']);
      python.on('close', (code) => resolve(code === 0));
      python.on('error', () => resolve(false));
    });

    const checkWhisper = new Promise<boolean>((resolve) => {
      const whisper = spawn(this.pythonPath, ['-c', 'import whisper']);
      whisper.on('close', (code) => resolve(code === 0));
      whisper.on('error', () => resolve(false));
    });

    const [pythonOk, whisperOk] = await Promise.all([checkPython, checkWhisper]);
    this.dependenciesCache = { python: pythonOk, whisper: whisperOk };
    return this.dependenciesCache;
  }

  /**
   * Transcribe audio file using Python Whisper
   */
  async transcribeFile(audioPath: string, model: string = 'turbo'): Promise<TranscriptionResult> {
    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    console.log(`Transcribing with Python Whisper (${model}): ${audioPath}`);

    return new Promise((resolve, reject) => {
      const pythonScript = `
import whisper
import json
import sys
import warnings
warnings.filterwarnings("ignore")

try:
    # Load model
    model = whisper.load_model("${model}")
    
    # Transcribe
    result = model.transcribe("${audioPath}", language="ja", task="transcribe")
    
    # Format output
    output = {
        "text": result["text"],
        "language": result.get("language", "ja"),
        "segments": []
    }
    
    # Add segments if available
    if "segments" in result:
        for segment in result["segments"]:
            output["segments"].append({
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"]
            })
    
    print(json.dumps(output))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`;

      const python = spawn(this.pythonPath, ['-c', pythonScript]);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', async (code) => {
        if (code !== 0) {
          console.error('Python Whisper error:', stderr);
          reject(new Error(`Python Whisper failed: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          
          if (result.error) {
            reject(new Error(result.error));
            return;
          }

          const transcriptionResult: TranscriptionResult = {
            text: result.text || '[BLANK_AUDIO]',
            confidence: 1.0, // Python Whisper doesn't provide confidence scores
            language: result.language || 'ja',
            segments: result.segments
          };

          // Save transcription
          await this.saveTranscriptionToFile(audioPath, transcriptionResult);
          
          resolve(transcriptionResult);
        } catch (error) {
          reject(new Error(`Failed to parse Python Whisper output: ${error}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error}`));
      });
    });
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

      let content = `Transcription Result (Python Whisper)\n`;
      content += `====================================\n`;
      content += `Audio File: ${audioFilePath}\n`;
      content += `Timestamp: ${new Date().toISOString()}\n`;
      content += `Language: ${result.language}\n`;
      content += `\nTranscription:\n`;
      content += `${result.text}\n`;

      if (result.segments && result.segments.length > 0) {
        content += `\nSegments:\n`;
        content += `=========\n`;
        result.segments.forEach((segment) => {
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
   * Get available Python Whisper models
   */
  static getAvailableModels(): string[] {
    return [
      'tiny',
      'base',
      'small',
      'medium',
      'large',
      'large-v2',
      'large-v3',
      'turbo'
    ];
  }
}