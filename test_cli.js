// Test CLI commands programmatically
import { RecordingManager } from './src/services/RecordingManager.js';

async function testRecordingFunctionality() {
  console.log('🔧 Testing Recording AI functionality...\n');
  
  try {
    // Initialize the recording manager
    console.log('1. Initializing RecordingManager...');
    const manager = new RecordingManager('./test_data');
    
    console.log('2. Loading Whisper model...');
    await manager.initialize();
    console.log('✅ Whisper model loaded successfully');
    
    // Test basic status
    console.log('\n3. Testing recording status...');
    const isRecording = manager.isRecording();
    console.log(`Recording status: ${isRecording ? 'Active' : 'Inactive'}`);
    
    // Test session management
    console.log('\n4. Testing session management...');
    const sessions = manager.getAllSessions();
    console.log(`Current sessions: ${sessions.length}`);
    
    // Test a short recording (this will likely fail due to permissions but we can see the error)
    console.log('\n5. Testing recording start (expect permission issues)...');
    try {
      const session = await manager.startRecording();
      console.log('✅ Recording started:', session.id);
      
      // Stop immediately
      setTimeout(async () => {
        try {
          const stoppedSession = await manager.stopRecording();
          console.log('✅ Recording stopped:', stoppedSession?.id);
        } catch (error) {
          console.log('⚠️ Stop recording error:', error.message);
        }
      }, 1000);
      
    } catch (error) {
      console.log('❌ Recording start error:', error.message);
      console.log('This is expected if microphone permissions are not granted or BlackHole is not configured.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testRecordingFunctionality();