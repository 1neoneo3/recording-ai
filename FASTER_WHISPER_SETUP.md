# Faster Whisper Setup Guide

Faster Whisper is a reimplementation of OpenAI's Whisper model using CTranslate2, which is a fast inference engine for Transformer models. It's up to 4x faster than the original implementation while consuming less memory.

## Installation

### Prerequisites

1. Python 3.8 or higher
2. pip package manager

### Basic Installation

```bash
# Install faster-whisper
pip install faster-whisper

# For GPU support (NVIDIA CUDA)
pip install faster-whisper[cuda]
```

### macOS Installation (Apple Silicon)

For M1/M2/M3 Macs, you can use CPU mode which is still very fast:

```bash
# Option 1: Using --break-system-packages (simplest)
pip3 install --break-system-packages faster-whisper

# Option 2: Using a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate
pip install faster-whisper

# Option 3: Using pipx
brew install pipx
pipx install faster-whisper
```

### Verify Installation

```bash
# Check if faster-whisper is installed
python3 src/python/faster_whisper_transcribe.py --check-deps
```

## Usage

1. Start the server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3001/realtime.html

3. Select a Faster Whisper model from the dropdown:
   - ⚡ Faster Tiny - Fastest, lowest accuracy
   - ⚡ Faster Base - Very fast, good accuracy
   - ⚡ Faster Small - Fast, better accuracy
   - ⚡ Faster Medium - Good balance of speed and accuracy
   - ⚡ Faster Large v2 - High accuracy, slower
   - ⚡ Faster Large v3 - Latest model, highest accuracy

## Performance Tips

1. **Model Selection**:
   - For real-time transcription: Use Tiny or Base
   - For accuracy: Use Small or Medium
   - For best quality: Use Large v2 or v3

2. **Hardware**:
   - CPU: All models work, but larger models are slower
   - GPU (NVIDIA): Significantly faster for all models
   - Apple Silicon: CPU mode is optimized and fast

3. **First Run**:
   - Models are downloaded on first use
   - Download sizes:
     - Tiny: ~39 MB
     - Base: ~74 MB
     - Small: ~244 MB
     - Medium: ~769 MB
     - Large v2: ~1.5 GB
     - Large v3: ~1.5 GB

## Troubleshooting

### "faster-whisper not installed" error

```bash
pip install faster-whisper
```

### "No module named 'ctranslate2'" error

```bash
pip install ctranslate2
```

### Model download issues

Models are cached in `~/.cache/faster-whisper/`. If you have issues:

```bash
# Clear cache
rm -rf ~/.cache/faster-whisper/

# Re-download models by using them
```

### GPU not detected

For NVIDIA GPUs:
```bash
# Install CUDA support
pip install faster-whisper[cuda]

# Check CUDA availability
python3 -c "import torch; print(torch.cuda.is_available())"
```

## Comparison with Other Whisper Implementations

| Feature | OpenAI Whisper | Whisper.cpp | Faster Whisper |
|---------|---------------|-------------|----------------|
| Speed | Baseline | 2-3x faster | 4x faster |
| Memory | High | Low | Medium |
| GPU Support | Yes | Limited | Yes |
| Accuracy | Baseline | Same | Same |
| Installation | Easy | Complex | Easy |