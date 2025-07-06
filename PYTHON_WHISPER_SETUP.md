# Python Whisper セットアップガイド

このプロジェクトでは、OpenAI Whisper Turboモデルを使用するために、Python版のWhisperをオプションとして利用できます。

## 必要要件

- Python 3.8以上
- ffmpeg（音声ファイルの処理用）

## インストール手順

### 1. Python Whisperのインストール

```bash
pip install openai-whisper
```

### 2. ffmpegのインストール（必要な場合）

macOS:
```bash
brew install ffmpeg
```

Ubuntu/Debian:
```bash
sudo apt update && sudo apt install ffmpeg
```

Windows:
[ffmpeg公式サイト](https://ffmpeg.org/download.html)からダウンロード

### 3. 動作確認

```bash
# Pythonでwhisperがインポートできることを確認
python3 -c "import whisper; print('Whisper installed successfully')"
```

## 利用可能なモデル

Python版で利用できるモデル：
- `tiny` - 最小・最速（39M）
- `base` - 基本モデル（74M）
- `small` - 小型モデル（244M）
- `medium` - 中型モデル（769M）
- `large` - 大型モデル（1550M）
- `large-v2` - 大型モデルv2（1550M）
- `large-v3` - 大型モデルv3（1550M）
- `turbo` - 高速版（809M）⭐ NEW!

## 使用方法

1. リアルタイム文字起こしページで、モデル選択から「🚀 Turbo (Python版・超高速)」を選択
2. 録音を開始
3. Python Whisperが自動的に使用されます

## トラブルシューティング

### Python Whisperが動作しない場合

1. Pythonバージョンを確認:
   ```bash
   python3 --version
   ```

2. whisperの再インストール:
   ```bash
   pip uninstall openai-whisper
   pip install openai-whisper
   ```

3. 依存関係の確認:
   ```bash
   pip install --upgrade torch torchaudio
   ```

### フォールバック機能

Python Whisperが利用できない場合、自動的にブラウザ版のWhisperにフォールバックします。

## パフォーマンス比較

| モデル | 速度 | 精度 | メモリ使用量 |
|--------|------|------|--------------|
| Turbo | ⚡⚡⚡⚡⚡ | ⭐⭐⭐⭐ | 中 |
| Large-v3 | ⚡⚡ | ⭐⭐⭐⭐⭐ | 高 |
| Medium | ⚡⚡⚡ | ⭐⭐⭐⭐ | 中 |

## 注意事項

- 初回実行時はモデルのダウンロードに時間がかかります（数百MB〜1.5GB）
- GPUがある場合は自動的にGPUを使用します
- Turboモデルは翻訳タスクには対応していません（文字起こしのみ）