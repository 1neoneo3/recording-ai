// Test recording with basic Node.js approach
import { exec } from 'child_process';
import fs from 'fs';

async function testBasicRecording() {
  console.log('Testing basic recording capabilities...');
  
  // Check audio devices
  console.log('\n1. Checking audio devices:');
  exec('system_profiler SPAudioDataType', (error, stdout, stderr) => {
    if (error) {
      console.log('Error checking audio devices:', error.message);
      return;
    }
    console.log('Audio devices found:');
    console.log(stdout.split('\n').slice(0, 20).join('\n')); // First 20 lines
  });
  
  // Test if we can create audio directories
  console.log('\n2. Testing directory creation:');
  const testDir = './test_recordings';
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
    console.log('✅ Created test recordings directory');
  } else {
    console.log('✅ Test recordings directory exists');
  }
  
  // Check if ffmpeg is available
  console.log('\n3. Checking ffmpeg availability:');
  exec('which ffmpeg', (error, stdout, stderr) => {
    if (error) {
      console.log('❌ ffmpeg not found - installing via Homebrew');
      console.log('Run: brew install ffmpeg');
    } else {
      console.log('✅ ffmpeg found at:', stdout.trim());
      
      // Test ffmpeg basic functionality
      exec('ffmpeg -version', (error, stdout, stderr) => {
        if (error) {
          console.log('❌ ffmpeg error:', error.message);
        } else {
          console.log('✅ ffmpeg version:', stdout.split('\n')[0]);
        }
      });
    }
  });
  
  // Test microphone permissions
  console.log('\n4. Testing microphone permissions:');
  console.log('Note: You may need to grant microphone access in System Preferences > Security & Privacy > Privacy > Microphone');
}

testBasicRecording();