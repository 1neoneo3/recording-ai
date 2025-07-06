import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { RecordingManager } from '../services/RecordingManager.js';
import { RecordingConfig } from '../types/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// File upload configuration
const upload = multer({
  dest: './uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Initialize recording manager
const recordingManager = new RecordingManager();

// API Routes

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Initialize the recording system
 */
app.post('/api/initialize', async (req: Request, res: Response) => {
  try {
    await recordingManager.initialize();
    res.json({ message: 'Recording system initialized successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initialize recording system' });
  }
});

/**
 * Start recording
 */
app.post('/api/recording/start', async (req: Request, res: Response) => {
  try {
    const config: RecordingConfig = req.body;
    const session = await recordingManager.startRecording(config);
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to start recording' });
  }
});

/**
 * Stop recording
 */
app.post('/api/recording/stop', async (req: Request, res: Response) => {
  try {
    const { transcribe = true } = req.body;
    const session = await recordingManager.stopRecording(transcribe);
    
    if (!session) {
      return res.status(400).json({ error: 'No recording in progress' });
    }
    
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to stop recording' });
  }
});

/**
 * Get recording status
 */
app.get('/api/recording/status', (req: Request, res: Response) => {
  const isRecording = recordingManager.isRecording();
  const currentSession = recordingManager.getCurrentSession();
  
  res.json({
    isRecording,
    currentSession
  });
});

/**
 * Get session by ID
 */
app.get('/api/sessions/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = recordingManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json(session);
});

/**
 * Get all sessions
 */
app.get('/api/sessions', (req: Request, res: Response) => {
  const sessions = recordingManager.getAllSessions();
  res.json(sessions);
});

/**
 * Upload and transcribe audio file
 */
app.post('/api/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const transcription = await recordingManager.transcribeFile(req.file.path);
    res.json(transcription);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Transcription failed' });
  }
});

/**
 * Start server
 */
async function startServer() {
  try {
    await recordingManager.initialize();
    await recordingManager.loadAllSessions();
    
    app.listen(PORT, () => {
      console.log(`Recording AI server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

export default app;
export { startServer };