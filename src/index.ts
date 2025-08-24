#!/usr/bin/env node

import { startServer } from './api/server.js';
import { RecordingManager } from './services/RecordingManager.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--cli') {
    await startCLI();
  } else if (args[0] === '--transcribe' && args[1]) {
    await transcribeFile(args[1]);
  } else if (args[0] === '--help') {
    console.log('Usage:');
    console.log('  npm run dev                    - Start API server');
    console.log('  npm run dev -- --cli           - Start CLI interface');
    console.log('  npm run dev -- --transcribe <file> - Transcribe audio file');
    return;
  } else {
    // Default: start server
    await startServer();
  }
}

async function startCLI() {
  const recordingManager = new RecordingManager();
  
  console.log('Initializing Recording AI CLI...');
  await recordingManager.initialize();
  await recordingManager.loadAllSessions();
  
  console.log('Recording AI CLI ready!');
  console.log('Commands:');
  console.log('  start - Start recording');
  console.log('  stop  - Stop recording');
  console.log('  status - Check recording status');
  console.log('  sessions - List all sessions');
  console.log('  quit  - Exit CLI');
  
  const { createInterface } = await import('readline');
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const prompt = () => {
    rl.question('recording-ai> ', async (input: string) => {
      const command = input.trim().toLowerCase();
      
      try {
        switch (command) {
          case 'start':
            if (recordingManager.isRecording()) {
              console.log('Recording already in progress');
            } else {
              const config = {
                sampleRate: 16000,
                channels: 1,
                audioType: 'wav' as const
              };
              console.log('Starting recording with config:', config);
              const session = await recordingManager.startRecording(config);
              console.log(`Recording started: ${session.id}`);
            }
            break;
            
          case 'stop':
            if (!recordingManager.isRecording()) {
              console.log('No recording in progress');
            } else {
              console.log('Stopping recording and transcribing...');
              const session = await recordingManager.stopRecording(true);
              if (session) {
                console.log(`Recording stopped: ${session.id}`);
                if (session.transcription) {
                  console.log(`Transcription: ${session.transcription.text}`);
                }
              }
            }
            break;
            
          case 'status':
            const isRecording = recordingManager.isRecording();
            const currentSession = recordingManager.getCurrentSession();
            console.log(`Recording: ${isRecording ? 'Yes' : 'No'}`);
            if (currentSession) {
              console.log(`Current session: ${currentSession.id}`);
              console.log(`Started: ${currentSession.startTime}`);
            }
            break;
            
          case 'sessions':
            const sessions = recordingManager.getAllSessions();
            console.log(`Total sessions: ${sessions.length}`);
            sessions.forEach(session => {
              console.log(`  ${session.id} - ${session.status} - ${session.startTime}`);
              if (session.transcription) {
                console.log(`    "${session.transcription.text.substring(0, 50)}..."`);
              }
            });
            break;
            
          case 'quit':
          case 'exit':
            rl.close();
            return;
            
          default:
            console.log('Unknown command. Available: start, stop, status, sessions, quit');
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
      }
      
      prompt();
    });
  };
  
  prompt();
}

async function transcribeFile(filePath: string) {
  const recordingManager = new RecordingManager();
  
  console.log('Initializing Whisper...');
  await recordingManager.initialize();
  
  console.log(`Transcribing: ${filePath}`);
  try {
    const result = await recordingManager.transcribeFile(filePath);
    console.log('Transcription result:');
    console.log(result.text);
    
    if (result.confidence) {
      console.log(`Confidence: ${result.confidence}`);
    }
  } catch (error) {
    console.error('Transcription failed:', error);
  }
}

// Always run main function
main().catch(console.error);