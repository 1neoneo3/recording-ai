import { AudioRecorder } from './AudioRecorder.js';
import { WhisperService } from './WhisperService.js';
import { RecordingSession, RecordingConfig, TranscriptionResult, AudioFile } from '../types/index.js';
import fs from 'fs';
import path from 'path';

export class RecordingManager {
  private audioRecorder: AudioRecorder;
  private whisperService: WhisperService;
  private sessions: Map<string, RecordingSession> = new Map();
  private dataDir: string;

  constructor(
    dataDir: string = './data',
    whisperModel: string = 'Xenova/whisper-base'
  ) {
    this.dataDir = dataDir;
    this.audioRecorder = new AudioRecorder(path.join(dataDir, 'recordings'));
    this.whisperService = new WhisperService(whisperModel);
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Initialize the recording manager
   */
  async initialize(): Promise<void> {
    await this.whisperService.initialize();
    console.log('Recording manager initialized');
  }

  /**
   * Start a new recording session
   */
  async startRecording(config?: RecordingConfig): Promise<RecordingSession> {
    const session = await this.audioRecorder.startRecording(config);
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Stop the current recording and optionally transcribe
   */
  async stopRecording(transcribe: boolean = true): Promise<RecordingSession | null> {
    const audioFile = await this.audioRecorder.stopRecording();
    const session = this.audioRecorder.getCurrentSession();
    
    if (!audioFile || !session) {
      return null;
    }

    // Update session with audio file info
    session.audioFile = audioFile;
    session.status = 'processing';
    this.sessions.set(session.id, session);

    // Transcribe if requested
    if (transcribe) {
      try {
        const transcription = await this.whisperService.transcribeFile(audioFile);
        session.transcription = transcription;
        session.status = 'completed';
      } catch (error) {
        console.error('Transcription failed:', error);
        session.status = 'error';
      }
    } else {
      session.status = 'completed';
    }

    // Save session data
    await this.saveSession(session);
    
    return session;
  }

  /**
   * Transcribe an existing audio file
   */
  async transcribeFile(filePath: string): Promise<TranscriptionResult> {
    const audioFile: AudioFile = {
      path: filePath,
      duration: 0,
      size: fs.statSync(filePath).size,
      format: path.extname(filePath).toLowerCase().substring(1),
      sampleRate: 16000,
      channels: 1
    };

    return await this.whisperService.transcribeFile(audioFile);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): RecordingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): RecordingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Save session data to JSON file
   */
  private async saveSession(session: RecordingSession): Promise<void> {
    const sessionFile = path.join(this.dataDir, 'sessions', `${session.id}.json`);
    const sessionDir = path.dirname(sessionFile);
    
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  }

  /**
   * Load session data from JSON file
   */
  private async loadSession(sessionId: string): Promise<RecordingSession | null> {
    const sessionFile = path.join(this.dataDir, 'sessions', `${sessionId}.json`);
    
    if (!fs.existsSync(sessionFile)) {
      return null;
    }

    try {
      const sessionData = fs.readFileSync(sessionFile, 'utf-8');
      return JSON.parse(sessionData);
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  /**
   * Load all sessions from disk
   */
  async loadAllSessions(): Promise<void> {
    const sessionsDir = path.join(this.dataDir, 'sessions');
    
    if (!fs.existsSync(sessionsDir)) {
      return;
    }

    const files = fs.readdirSync(sessionsDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const sessionId = path.basename(file, '.json');
        const session = await this.loadSession(sessionId);
        if (session) {
          this.sessions.set(sessionId, session);
        }
      }
    }
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.audioRecorder.isRecording();
  }

  /**
   * Get current recording session
   */
  getCurrentSession(): RecordingSession | null {
    return this.audioRecorder.getCurrentSession();
  }
}