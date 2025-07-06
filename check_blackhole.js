// BlackHole setup checker
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkBlackHoleSetup() {
  console.log('🔍 Checking BlackHole setup...\n');
  
  try {
    // 1. Check if BlackHole is installed
    console.log('1. Checking BlackHole installation...');
    try {
      const { stdout } = await execAsync('system_profiler SPAudioDataType | grep -i blackhole');
      if (stdout.trim()) {
        console.log('✅ BlackHole is installed');
        console.log('   Found:', stdout.trim().split('\n')[0]);
      } else {
        console.log('❌ BlackHole not found in system audio devices');
        console.log('   Install with: brew install --cask blackhole-2ch');
        console.log('   Then restart your Mac');
      }
    } catch (error) {
      console.log('❌ BlackHole not detected');
      console.log('   Install from: https://existential.audio/blackhole/');
    }
    
    // 2. Check available FFmpeg audio devices
    console.log('\n2. Checking FFmpeg audio devices...');
    try {
      const { stderr } = await execAsync('ffmpeg -f avfoundation -list_devices true -i "" 2>&1');
      const lines = stderr.split('\n');
      
      console.log('\n📋 Available Audio Devices:');
      let inAudioSection = false;
      let blackHoleFound = false;
      
      for (const line of lines) {
        if (line.includes('AVFoundation audio devices:')) {
          inAudioSection = true;
          continue;
        }
        if (inAudioSection && line.includes('[')) {
          const match = line.match(/\[(\d+)\]\s+(.+)/);
          if (match) {
            const deviceName = match[2];
            console.log(`   [${match[1]}] ${deviceName}`);
            
            if (deviceName.toLowerCase().includes('blackhole')) {
              blackHoleFound = true;
              console.log('       ⭐ BlackHole device found!');
            }
            if (deviceName.toLowerCase().includes('mic') || deviceName.toLowerCase().includes('マイク')) {
              console.log('       🎤 Microphone device');
            }
            if (deviceName.toLowerCase().includes('speaker') || deviceName.toLowerCase().includes('スピーカー')) {
              console.log('       🔊 Speaker device');
            }
          }
        }
      }
      
      if (!blackHoleFound) {
        console.log('\n⚠️  BlackHole audio device not found in FFmpeg');
        console.log('   This might indicate BlackHole is not properly installed or configured');
      }
      
    } catch (error) {
      console.log('❌ Error checking FFmpeg devices:', error.message);
    }
    
    // 3. Check current audio output device
    console.log('\n3. Checking current audio output...');
    try {
      const { stdout } = await execAsync('system_profiler SPAudioDataType | grep -A1 "Default Output Device: Yes"');
      console.log('Current default output:', stdout.trim().split('\n')[0]);
      
      if (stdout.includes('BlackHole') || stdout.includes('Multi-Output')) {
        console.log('✅ System audio output is configured for recording');
      } else {
        console.log('⚠️  System audio output may not be configured for BlackHole recording');
        console.log('   To record system audio, set output to BlackHole or Multi-Output Device');
      }
    } catch (error) {
      console.log('Could not determine current audio output');
    }
    
    // 4. Setup recommendations
    console.log('\n📝 Setup Recommendations:');
    console.log('');
    console.log('For SYSTEM AUDIO recording (YouTube, Spotify, etc.):');
    console.log('  1. Install BlackHole: brew install --cask blackhole-2ch');
    console.log('  2. Create Multi-Output Device in Audio MIDI Setup');
    console.log('  3. Set system output to Multi-Output Device');
    console.log('  4. Use device index 0 in recording');
    console.log('');
    console.log('For MICROPHONE recording:');
    console.log('  1. Grant microphone access in Privacy settings');
    console.log('  2. Use built-in microphone device');
    console.log('  3. No BlackHole needed');
    console.log('');
    console.log('Test recording:');
    console.log('  npm run dev -- --cli');
    console.log('  Then use "start" and "stop" commands');
    
  } catch (error) {
    console.error('Error during check:', error.message);
  }
}

checkBlackHoleSetup();