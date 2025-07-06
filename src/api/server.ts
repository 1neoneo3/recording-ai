import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { RecordingManager } from '../services/RecordingManager.js';
import { RecordingConfig } from '../types/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory with caching
const publicPath = path.resolve(__dirname, '../../public');
console.log('Serving static files from:', publicPath);
app.use(express.static(publicPath, {
  maxAge: '1h', // Cache static files for 1 hour
  etag: true,
  lastModified: true
}));

// File upload configuration
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    // Keep original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
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
    
    // Get model from request body
    const model = req.body.model || 'Xenova/whisper-medium';
    
    // Check if the file needs conversion to WAV
    const fileExt = path.extname(req.file.filename).toLowerCase();
    let audioFilePath = req.file.path;
    
    // If not WAV, convert to WAV using ffmpeg
    if (fileExt !== '.wav') {
      const wavPath = req.file.path.replace(fileExt, '.wav');
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      try {
        // Log file size for debugging
        const fileStats = fs.statSync(req.file.path);
        console.log(`Input file size: ${fileStats.size} bytes`);
        
        console.log(`Converting ${fileExt || 'webm'} to WAV: ${req.file.path} -> ${wavPath}`);
        // Convert to WAV format with 16kHz sample rate, mono, PCM 16-bit
        // Add -f webm to help ffmpeg recognize the format
        const ffmpegCmd = fileExt === '.webm' || !fileExt 
          ? `ffmpeg -f webm -i "${req.file.path}" -ar 16000 -ac 1 -acodec pcm_s16le -f wav "${wavPath}"`
          : `ffmpeg -i "${req.file.path}" -ar 16000 -ac 1 -acodec pcm_s16le -f wav "${wavPath}"`;
        console.log('FFmpeg command:', ffmpegCmd);
        
        const result = await execAsync(ffmpegCmd);
        console.log('FFmpeg output:', result.stdout);
        if (result.stderr) console.log('FFmpeg stderr:', result.stderr);
        
        audioFilePath = wavPath;
        
        // Check converted file size
        const stats = fs.statSync(wavPath);
        console.log(`Converted WAV file size: ${stats.size} bytes`);
        
        // Clean up original file
        fs.unlinkSync(req.file.path);
      } catch (conversionError) {
        console.error('Audio conversion failed:', conversionError);
        throw new Error('Failed to convert audio to WAV format');
      }
    }
    
    const transcription = await recordingManager.transcribeFile(audioFilePath, model);
    
    // Clean up converted file
    if (audioFilePath !== req.file.path && fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
    }
    
    res.json(transcription);
  } catch (error) {
    res.status(500).json({ error: `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

/**
 * Serve the realtime transcription page
 */
app.get('/realtime', (req: Request, res: Response) => {
  const realtimePath = path.resolve(__dirname, '../../public/realtime.html');
  // Remove excessive logging
  if (!fs.existsSync(realtimePath)) {
    console.error('realtime.html not found at:', realtimePath);
    return res.status(404).send('Realtime page not found');
  }
  res.sendFile(realtimePath);
});

/**
 * Start server
 */
async function startServer() {
  try {
    // Start server immediately for faster page loading
    app.listen(PORT, () => {
      console.log(`Recording AI server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Realtime transcription: http://localhost:${PORT}/realtime`);
      
      // Initialize recording manager in background
      recordingManager.initialize()
        .then(() => recordingManager.loadAllSessions())
        .then(() => {
          console.log('Recording manager fully initialized');
          // Preload default Whisper model in background
          return recordingManager.preloadDefaultModel();
        })
        .catch(error => console.error('Failed to initialize:', error));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

export default app;
export { startServer };