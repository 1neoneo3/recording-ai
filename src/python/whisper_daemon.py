#!/usr/bin/env python3
"""
Whisper Daemon - Persistent faster-whisper process
Keeps model loaded in memory for fast transcription
"""

import sys
import json
import os
import time
import signal
import threading
from pathlib import Path
import warnings
import site

# Suppress warnings to stderr to keep stdout clean for JSON output
warnings.filterwarnings("ignore")
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # Suppress TensorFlow warnings
os.environ['KMP_WARNINGS'] = 'FALSE'  # Suppress Intel MKL warnings
os.environ['MKL_NUM_THREADS'] = '1'  # Prevent Intel MKL threading warnings

# Set CUDNN library path for uv virtual environment
try:
    site_packages = site.getsitepackages()[0]  # Get first site-packages directory
    
    # Set multiple NVIDIA library paths
    nvidia_lib_paths = []
    nvidia_base = os.path.join(site_packages, "nvidia")
    
    if os.path.exists(nvidia_base):
        # Add CUDNN lib directory
        cudnn_lib_path = os.path.join(nvidia_base, "cudnn", "lib")
        if os.path.exists(cudnn_lib_path):
            nvidia_lib_paths.append(cudnn_lib_path)
        
        # Add other NVIDIA library directories
        for subdir in os.listdir(nvidia_base):
            subdir_path = os.path.join(nvidia_base, subdir)
            if os.path.isdir(subdir_path):
                lib_path = os.path.join(subdir_path, "lib")
                if os.path.exists(lib_path):
                    nvidia_lib_paths.append(lib_path)
    
    if nvidia_lib_paths:
        current_ld_path = os.environ.get('LD_LIBRARY_PATH', '')
        new_paths = ':'.join(nvidia_lib_paths)
        
        if current_ld_path:
            os.environ['LD_LIBRARY_PATH'] = f"{new_paths}:{current_ld_path}"
        else:
            os.environ['LD_LIBRARY_PATH'] = new_paths
            
        print(f"Set NVIDIA library paths: {nvidia_lib_paths}", file=sys.stderr)
        
        # Also set CUDA_PATH for additional compatibility
        os.environ['CUDA_PATH'] = '/usr/local/cuda'
        os.environ['CUDNN_PATH'] = os.path.join(nvidia_base, "cudnn")
        
        # Preload CUDNN libraries to force early loading
        cudnn_lib_files = [
            'libcudnn.so.9',
            'libcudnn_ops.so.9', 
            'libcudnn_cnn.so.9',
            'libcudnn_adv.so.9'
        ]
        
        preload_libs = []
        for lib_file in cudnn_lib_files:
            lib_path = os.path.join(cudnn_lib_path, lib_file)
            if os.path.exists(lib_path):
                preload_libs.append(lib_path)
        
        if preload_libs:
            current_preload = os.environ.get('LD_PRELOAD', '')
            new_preload = ':'.join(preload_libs)
            if current_preload:
                os.environ['LD_PRELOAD'] = f"{new_preload}:{current_preload}"
            else:
                os.environ['LD_PRELOAD'] = new_preload
            print(f"Set LD_PRELOAD for CUDNN libraries: {preload_libs}", file=sys.stderr)
            
            # Try to explicitly load CUDNN libraries using ctypes
            try:
                import ctypes
                for lib_path in preload_libs:
                    ctypes.CDLL(lib_path, mode=ctypes.RTLD_GLOBAL)
                print("Successfully preloaded CUDNN libraries with ctypes", file=sys.stderr)
            except Exception as ctypes_error:
                print(f"Warning: Could not preload libraries with ctypes: {ctypes_error}", file=sys.stderr)
        
except Exception as e:
    print(f"Warning: Could not set NVIDIA library paths: {e}", file=sys.stderr)

# Add error handling for imports
try:
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({
        "error": "faster-whisper not installed. Please run: pip install faster-whisper"
    }))
    sys.exit(1)

# Global variables
model = None
model_name = None
device = None
compute_type = None
shutdown_flag = False

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    global shutdown_flag
    print("Received shutdown signal, cleaning up...", file=sys.stderr)
    shutdown_flag = True

def initialize_model(model_name_param="large-v3", device_param="auto", compute_type_param="auto"):
    """Initialize the whisper model once"""
    global model, model_name, device, compute_type
    
    try:
        print(f"Initializing model: {model_name_param}, device: {device_param}", file=sys.stderr)
        
        # Auto-detect device if needed
        if device_param == "auto":
            # Test CUDA availability and try GPU first
            try:
                import torch
                if torch.cuda.is_available():
                    # Test basic CUDA operation to ensure it works
                    test_tensor = torch.tensor([1.0]).cuda()
                    del test_tensor  # Clean up
                    torch.cuda.empty_cache()
                    device_param = "cuda"
                    print("Auto device selection: Using CUDA GPU", file=sys.stderr)
                else:
                    device_param = "cpu"
                    print("Auto device selection: CUDA not available, using CPU", file=sys.stderr)
            except Exception as e:
                print(f"CUDA test failed, falling back to CPU: {e}", file=sys.stderr)
                device_param = "cpu"
        
        # Auto-select compute type based on device
        if compute_type_param == "auto":
            if device_param == "cuda":
                compute_type_param = "float32"  # Use float32 for better accuracy
            else:
                compute_type_param = "int8"
        
        # Set CUDA memory fraction and environment for stability
        if device_param == "cuda":
            try:
                import torch
                if torch.cuda.is_available():
                    # Set memory fraction to avoid OOM
                    torch.cuda.set_per_process_memory_fraction(0.7)
                    torch.cuda.empty_cache()
                    
                    # Set cuDNN environment variables for stability
                    os.environ['CUDNN_DETERMINISTIC'] = '1'
                    os.environ['CUDNN_BENCHMARK'] = '0'
                    
                    print(f"CUDA setup complete. GPU: {torch.cuda.get_device_name(0)}", file=sys.stderr)
            except Exception as e:
                print(f"CUDA memory setup warning: {e}", file=sys.stderr)
        
        start_time = time.time()
        
        try:
            model = WhisperModel(
                model_name_param, 
                device=device_param,
                compute_type=compute_type_param,
                download_root=os.path.expanduser("~/.cache/faster-whisper")
            )
            
            # Store current configuration
            model_name = model_name_param
            device = device_param  
            compute_type = compute_type_param
            
            load_time = time.time() - start_time
            print(f"Model loaded successfully in {load_time:.2f} seconds", file=sys.stderr)
            print(f"Configuration: model={model_name}, device={device}, compute_type={compute_type}", file=sys.stderr)
            
            return True
            
        except Exception as e:
            # If CUDA fails, retry with CPU
            if device_param == "cuda":
                print(f"CUDA model loading failed: {e}, retrying with CPU", file=sys.stderr)
                device_param = "cpu"
                compute_type_param = "int8"
                
                model = WhisperModel(
                    model_name_param, 
                    device=device_param,
                    compute_type=compute_type_param,
                    download_root=os.path.expanduser("~/.cache/faster-whisper")
                )
                
                # Store current configuration
                model_name = model_name_param
                device = device_param
                compute_type = compute_type_param
                
                load_time = time.time() - start_time
                print(f"Model loaded on CPU in {load_time:.2f} seconds", file=sys.stderr)
                return True
            else:
                raise e
                
    except Exception as e:
        print(f"Failed to initialize model: {e}", file=sys.stderr)
        return False

def transcribe_audio_file(audio_path):
    """Transcribe a single audio file using the loaded model"""
    global model, model_name, device, compute_type
    
    if model is None:
        return {
            "error": "Model not initialized",
            "text": ""
        }
    
    try:
        # Validate audio file exists
        if not os.path.exists(audio_path):
            return {
                "error": f"Audio file not found: {audio_path}",
                "text": ""
            }
        
        print(f"Transcribing: {audio_path}", file=sys.stderr)
        transcribe_start_time = time.time()
        
        try:
            # Use same parameters for both large-v2 and large-v3 models
            if model_name in ["large-v2", "large-v3"]:
                segments, info = model.transcribe(
                    audio_path,
                    beam_size=5,  # Increased for better accuracy
                    language="ja",  # Japanese
                    vad_filter=True,  # Enable VAD filter for better accuracy
                    vad_parameters=dict(
                        min_silence_duration_ms=1000,  # Increased to avoid cutting off speech
                        speech_pad_ms=600,  # Increased padding to capture speech boundaries
                        threshold=0.3  # Lower threshold to be more sensitive to speech
                    ),
                    word_timestamps=True,  # Enable word-level timestamps for better segmentation
                    condition_on_previous_text=True,  # Use context from previous segments
                    temperature=0.0,  # Reduce randomness for more consistent results
                    compression_ratio_threshold=2.4,  # Default threshold
                    log_prob_threshold=-1.0  # Default threshold
                )
            else:
                # Use default parameters for other models
                segments, info = model.transcribe(
                    audio_path,
                    language="ja",  # Japanese
                    vad_filter=True,
                    word_timestamps=False,
                    condition_on_previous_text=False
                )
            
            transcribe_time = time.time() - transcribe_start_time
            print(f"Transcription completed in {transcribe_time:.2f} seconds", file=sys.stderr)
            
        except Exception as transcribe_error:
            print(f"Transcription error: {transcribe_error}", file=sys.stderr)
            raise transcribe_error
        
        # Collect transcription text with error handling
        text_segments = []
        try:
            for segment in segments:
                text_segments.append(segment.text.strip())
            
            # Join segments
            full_text = " ".join(text_segments)
            
            # Debug output
            print(f"Extracted {len(text_segments)} segments: '{full_text}'", file=sys.stderr)
            
            # Clean up CUDA memory if using CUDA
            if device == "cuda":
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass
            
            # Return result
            result = {
                "text": full_text,
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "model": model_name,
                "device": device,
                "compute_type": compute_type,
                "transcribe_time": round(transcribe_time, 2),
                "segments": len(text_segments)
            }
            
            return result
            
        except Exception as e:
            print(f"Error processing segments: {e}", file=sys.stderr)
            return {
                "text": "Transcription completed but segment processing failed",
                "error": f"Segment processing error: {str(e)}",
                "model": model_name,
                "device": device,
                "compute_type": compute_type,
                "transcribe_time": round(time.time() - transcribe_start_time, 2)
            }
        
    except Exception as e:
        print(f"Transcription failed: {e}", file=sys.stderr)
        return {
            "error": str(e),
            "text": "",
            "model": model_name,
            "device": device
        }

def main():
    """Main daemon loop"""
    global shutdown_flag
    
    # Set up signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    print("Whisper Daemon starting...", file=sys.stderr)
    
    # Initialize model
    if not initialize_model():
        print("Failed to initialize model, exiting", file=sys.stderr)
        sys.exit(1)
    
    print("Whisper Daemon ready for requests", file=sys.stderr)
    
    # Main processing loop
    try:
        while not shutdown_flag:
            try:
                # Read input from stdin (blocking)
                line = sys.stdin.readline()
                if not line:  # EOF
                    print("Received EOF, shutting down", file=sys.stderr)
                    break
                    
                line = line.strip()
                if not line:
                    continue
                
                # Parse JSON request
                try:
                    request = json.loads(line)
                    audio_path = request.get('audio_path')
                    
                    if not audio_path:
                        result = {"error": "No audio_path provided", "text": ""}
                    else:
                        result = transcribe_audio_file(audio_path)
                    
                except json.JSONDecodeError:
                    # Treat as plain audio path for backward compatibility
                    result = transcribe_audio_file(line)
                
                # Send JSON response
                response = json.dumps(result, ensure_ascii=False)
                print(response)
                sys.stdout.flush()
                
            except KeyboardInterrupt:
                print("Received KeyboardInterrupt", file=sys.stderr)
                break
            except Exception as e:
                error_result = {"error": f"Processing error: {str(e)}", "text": ""}
                print(json.dumps(error_result), file=sys.stderr)
                print(json.dumps(error_result))
                sys.stdout.flush()
                
    except Exception as e:
        print(f"Fatal error in main loop: {e}", file=sys.stderr)
    
    print("Whisper Daemon shutting down", file=sys.stderr)

if __name__ == "__main__":
    main()