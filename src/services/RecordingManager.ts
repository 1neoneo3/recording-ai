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
  private whisperServiceCache: Map<string, WhisperService> = new Map();

  constructor(
    dataDir: string = './data',
    whisperModel: string = 'Xenova/whisper-medium'
  ) {
    this.dataDir = dataDir;
    this.audioRecorder = new AudioRecorder(path.join(dataDir, 'recordings'));
    this.whisperService = new WhisperService(whisperModel);
    this.ensureDataDir();
    
    // Add default model to cache
    this.whisperServiceCache.set(whisperModel, this.whisperService);
    
    // Set callback for auto transcription
    this.audioRecorder.setStopCallback(async (sessionId: string) => {
      await this.autoTranscribe(sessionId);
    });
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
    // Skip Whisper initialization here - will be done on first use
    console.log('Recording manager initialized');
  }

  /**
   * Get WhisperService instance for preloading
   */
  getWhisperService(): WhisperService {
    return this.whisperService;
  }

  /**
   * Auto transcribe after recording stops
   */
  private async autoTranscribe(sessionId: string): Promise<void> {
    console.log(`Auto transcribing session: ${sessionId}`);
    
    const session = this.sessions.get(sessionId);
    if (!session || !session.audioFile) {
      console.error('Session or audio file not found for auto transcription');
      return;
    }

    try {
      session.status = 'processing';
      this.sessions.set(sessionId, session);

      const transcription = await this.whisperService.transcribeFile(session.audioFile);
      session.transcription = transcription;
      session.status = 'completed';
      
      console.log(`Auto transcription completed for session: ${sessionId}`);
    } catch (error) {
      console.error('Auto transcription failed:', error);
      session.status = 'error';
    }

    this.sessions.set(sessionId, session);
    await this.saveSession(session);
  }

  /**
   * Start a new recording session
   */
  async startRecording(config?: RecordingConfig): Promise<RecordingSession> {
    const session = await this.audioRecorder.startRecording(config);
    this.sessions.set(session.id, session);
    
    // Update session with audio file after recording stops
    setTimeout(() => {
      const currentSession = this.audioRecorder.getCurrentSession();
      if (currentSession && currentSession.id === session.id) {
        // Recording is still in progress, wait for auto-stop
        return;
      }
      
      // Recording stopped manually, update session
      this.updateSessionAfterStop(session.id);
    }, 1000);
    
    return session;
  }

  /**
   * Update session after recording stops
   */
  private async updateSessionAfterStop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const audioFilePath = path.join(this.dataDir, 'recordings', `${sessionId}.wav`);
    if (fs.existsSync(audioFilePath)) {
      const stats = fs.statSync(audioFilePath);
      session.audioFile = {
        path: audioFilePath,
        duration: 0,
        size: stats.size,
        format: 'wav',
        sampleRate: 16000,
        channels: 1
      };
      session.endTime = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Stop the current recording and optionally transcribe
   */
  async stopRecording(transcribe: boolean = true): Promise<RecordingSession | null> {
    if (!this.audioRecorder.isRecording()) {
      console.log('No recording in progress');
      return null;
    }

    const currentSession = this.audioRecorder.getCurrentSession();
    if (!currentSession) {
      console.log('No current session found');
      return null;
    }

    const audioFile = await this.audioRecorder.stopRecording();
    const session = this.sessions.get(currentSession.id);
    
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
  async transcribeFile(filePath: string, modelName?: string): Promise<TranscriptionResult> {
    // Use the requested model or default
    const targetModel = modelName || 'Xenova/whisper-medium';
    let whisperService: WhisperService;
    
    // Check if we have this model in cache
    if (this.whisperServiceCache.has(targetModel)) {
      whisperService = this.whisperServiceCache.get(targetModel)!;
    } else {
      // Create and cache new WhisperService for this model
      whisperService = new WhisperService(targetModel);
      await whisperService.initialize();
      this.whisperServiceCache.set(targetModel, whisperService);
    }
    
    const audioFile: AudioFile = {
      path: filePath,
      duration: 0,
      size: fs.statSync(filePath).size,
      format: path.extname(filePath).toLowerCase().substring(1),
      sampleRate: 16000,
      channels: 1
    };

    return await whisperService.transcribeFile(audioFile);
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