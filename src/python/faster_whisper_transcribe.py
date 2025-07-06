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

# Suppress warnings to stderr to keep stdout clean for JSON output
warnings.filterwarnings("ignore")
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # Suppress TensorFlow warnings
os.environ['KMP_WARNINGS'] = 'FALSE'  # Suppress Intel MKL warnings
os.environ['MKL_NUM_THREADS'] = '1'  # Prevent Intel MKL threading warnings
os.environ['CUDA_VISIBLE_DEVICES'] = '-1' if '--device' in sys.argv and 'cpu' in ' '.join(sys.argv) else os.environ.get('CUDA_VISIBLE_DEVICES', '')

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
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                device = "cpu"
        
        # Auto-select compute type based on device
        if compute_type == "auto":
            if device == "cuda":
                compute_type = "float16"
            else:
                compute_type = "int8"
        
        # Load model
        print(f"Loading faster-whisper model: {model_name} on {device} with {compute_type}", file=sys.stderr)
        start_time = time.time()
        model = WhisperModel(
            model_name, 
            device=device,
            compute_type=compute_type,
            download_root=MODEL_DIR
        )
        load_time = time.time() - start_time
        print(f"Model loaded in {load_time:.2f} seconds", file=sys.stderr)
        
        # Transcribe
        print(f"Starting transcription of {audio_path}", file=sys.stderr)
        start_time = time.time()
        segments, info = model.transcribe(
            audio_path,
            beam_size=1,  # Reduced for faster processing
            language="ja",  # Japanese
            vad_filter=True,  # Enable VAD filter for better accuracy
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=400
            )
        )
        print(f"Transcription completed in {time.time() - start_time:.2f} seconds", file=sys.stderr)
        
        # Collect transcription text
        text_segments = []
        for segment in segments:
            text_segments.append(segment.text.strip())
        
        transcribe_time = time.time() - start_time
        
        # Join segments
        full_text = " ".join(text_segments)
        
        # Return result
        return {
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
        "numpy": False
    }
    
    try:
        import faster_whisper
        dependencies["faster_whisper"] = True
    except ImportError:
        pass
    
    try:
        import torch
        dependencies["torch"] = True
        dependencies["cuda_available"] = torch.cuda.is_available()
    except ImportError:
        dependencies["cuda_available"] = False
    
    try:
        import numpy
        dependencies["numpy"] = True
    except ImportError:
        pass
    
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
    
    # Output JSON result
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()