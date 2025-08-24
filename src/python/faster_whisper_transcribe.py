#!/usr/bin/env python3
"""
Faster Whisper transcription script
Uses SYSTRAN/faster-whisper for efficient transcription
"""

import sys
import json
import os
import time
import argparse
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
# Only disable CUDA if explicitly requesting CPU device
if '--device' in sys.argv:
    device_arg_index = sys.argv.index('--device')
    if device_arg_index + 1 < len(sys.argv) and sys.argv[device_arg_index + 1] == 'cpu':
        os.environ['CUDA_VISIBLE_DEVICES'] = '-1'

# Add error handling for imports
try:
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({
        "error": "faster-whisper not installed. Please run: pip install faster-whisper"
    }))
    sys.exit(1)

# Default model directory
MODEL_DIR = os.path.expanduser("~/.cache/faster-whisper")

def transcribe_audio(audio_path, model_name="base", device="auto", compute_type="auto"):
    """
    Transcribe audio file using faster-whisper
    
    Args:
        audio_path: Path to audio file
        model_name: Model size (tiny, base, small, medium, large-v2, large-v3)
        device: Device to use (cpu, cuda, auto)
        compute_type: Compute type (int8, float16, float32, auto)
    """
    try:
        # Validate audio file exists
        if not os.path.exists(audio_path):
            return {
                "error": f"Audio file not found: {audio_path}",
                "text": ""
            }
        
        # Auto-detect device if needed
        if device == "auto":
            # Test CUDA availability and try GPU first
            try:
                import torch
                if torch.cuda.is_available():
                    # Test basic CUDA operation to ensure it works
                    test_tensor = torch.tensor([1.0]).cuda()
                    del test_tensor  # Clean up
                    torch.cuda.empty_cache()
                    device = "cuda"
                    print("Auto device selection: Using CUDA GPU", file=sys.stderr)
                else:
                    device = "cpu"
                    print("Auto device selection: CUDA not available, using CPU", file=sys.stderr)
            except Exception as e:
                print(f"CUDA test failed, falling back to CPU: {e}", file=sys.stderr)
                device = "cpu"
        
        # Auto-select compute type based on device
        if compute_type == "auto":
            if device == "cuda":
                # Use int8 for CUDA to avoid cuDNN issues
                compute_type = "int8"
            else:
                # Use int8 for CPU as well for consistency
                compute_type = "int8"
        
        # Set CUDA memory fraction and environment for stability
        if device == "cuda":
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
        
        # Load model with retry logic for CUDA issues
        print(f"Loading faster-whisper model: {model_name} on {device} with {compute_type}", file=sys.stderr)
        start_time = time.time()
        
        try:
            model = WhisperModel(
                model_name, 
                device=device,
                compute_type=compute_type,
                download_root=MODEL_DIR
            )
            load_time = time.time() - start_time
            print(f"Model loaded in {load_time:.2f} seconds", file=sys.stderr)
        except Exception as e:
            # If CUDA fails, retry with CPU
            if device == "cuda":
                print(f"CUDA model loading failed: {e}, retrying with CPU", file=sys.stderr)
                device = "cpu"
                compute_type = "int8"
                model = WhisperModel(
                    model_name, 
                    device=device,
                    compute_type=compute_type,
                    download_root=MODEL_DIR
                )
                load_time = time.time() - start_time
                print(f"Model loaded on CPU in {load_time:.2f} seconds", file=sys.stderr)
            else:
                raise e
        
        # Transcribe with error handling
        print(f"Starting transcription of {audio_path}", file=sys.stderr)
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
            print(f"Transcription completed in {time.time() - transcribe_start_time:.2f} seconds", file=sys.stderr)
        except Exception as transcribe_error:
            print(f"Transcription error: {transcribe_error}", file=sys.stderr)
            # Try to capture any partial output before the error
            raise transcribe_error
        
        # Collect transcription text with error handling
        text_segments = []
        try:
            for segment in segments:
                text_segments.append(segment.text.strip())
            
            transcribe_time = time.time() - transcribe_start_time
            
            # Join segments
            full_text = " ".join(text_segments)
            
            # Debug output
            print(f"DEBUG: Extracted {len(text_segments)} segments", file=sys.stderr)
            print(f"DEBUG: Full text: '{full_text}'", file=sys.stderr)
            
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
                "load_time": round(load_time, 2),
                "transcribe_time": round(transcribe_time, 2),
                "segments": len(text_segments)
            }
            
            # Also output to stderr as backup (for cuDNN crashes)
            print(f"WHISPER_RESULT_JSON:{json.dumps(result, ensure_ascii=False)}", file=sys.stderr)
            
            return result
        except Exception as e:
            print(f"WARNING: Error processing segments, but transcription may have succeeded: {e}", file=sys.stderr)
            # Try to return basic result even if segment processing failed
            return {
                "text": "Transcription completed but segment processing failed",
                "error": f"Segment processing error: {str(e)}",
                "model": model_name,
                "device": device,
                "compute_type": compute_type,
                "load_time": round(load_time, 2) if 'load_time' in locals() else 0,
                "transcribe_time": round(time.time() - transcribe_start_time, 2)
            }
        
    except Exception as e:
        return {
            "error": str(e),
            "text": "",
            "model": model_name,
            "device": device
        }

def check_dependencies():
    """Check if required dependencies are installed"""
    dependencies = {
        "faster_whisper": False,
        "torch": False,
        "numpy": False,
        "cuda_available": False
    }
    
    try:
        import faster_whisper
        dependencies["faster_whisper"] = True
        print(f"faster-whisper version: {faster_whisper.__version__}", file=sys.stderr)
    except ImportError as e:
        print(f"faster-whisper import error: {e}", file=sys.stderr)
    
    try:
        import torch
        dependencies["torch"] = True
        dependencies["cuda_available"] = torch.cuda.is_available()
        print(f"PyTorch version: {torch.__version__}", file=sys.stderr)
        print(f"CUDA available: {torch.cuda.is_available()}", file=sys.stderr)
        if torch.cuda.is_available():
            print(f"GPU device: {torch.cuda.get_device_name(0)}", file=sys.stderr)
            print(f"GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB", file=sys.stderr)
    except ImportError as e:
        print(f"PyTorch import error: {e}", file=sys.stderr)
    
    try:
        import numpy
        dependencies["numpy"] = True
        print(f"NumPy version: {numpy.__version__}", file=sys.stderr)
    except ImportError as e:
        print(f"NumPy import error: {e}", file=sys.stderr)
    
    return dependencies

def main():
    parser = argparse.ArgumentParser(description='Transcribe audio using faster-whisper')
    parser.add_argument('audio_file', nargs='?', help='Path to audio file')
    parser.add_argument('--model', default='base', 
                       choices=['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3'],
                       help='Model size (default: base)')
    parser.add_argument('--device', default='auto',
                       choices=['cpu', 'cuda', 'auto'],
                       help='Device to use (default: auto)')
    parser.add_argument('--compute-type', default='auto',
                       choices=['int8', 'float16', 'float32', 'auto'],
                       help='Compute type (default: auto)')
    parser.add_argument('--check-deps', action='store_true',
                       help='Check dependencies and exit')
    
    args = parser.parse_args()
    
    if args.check_deps:
        deps = check_dependencies()
        print(json.dumps(deps, indent=2))
        sys.exit(0)
    
    # Check if audio file is provided
    if not args.audio_file:
        parser.error('audio_file is required unless using --check-deps')
    
    # Transcribe audio
    result = transcribe_audio(
        args.audio_file,
        model_name=args.model,
        device=args.device,
        compute_type=args.compute_type
    )
    
    # Output JSON result and force flush
    output = json.dumps(result, ensure_ascii=False, indent=2)
    
    # Write result to temporary file as backup
    temp_file = f"/tmp/whisper_result_{os.getpid()}.json"
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(output)
    except Exception:
        pass
    
    print(output)
    sys.stdout.flush()
    
    # Force exit to prevent cuDNN errors after successful transcription
    if not result.get("error"):
        # Give OS time to flush output
        import time
        time.sleep(0.1)
        sys.exit(0)

if __name__ == "__main__":
    main()