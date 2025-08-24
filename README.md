# 音声リアルタイム文字起こし - Real-time Voice Transcription

TypeScript製のリアルタイム音声認識システム。Faster Whisperデーモンによる超高速処理（152倍高速化）とCUDNN GPU最適化を実現したハイパフォーマンス音声認識アプリケーション。

## ✨ 主な特徴

- 🚀 **超高速処理**: Whisperデーモンによる152倍高速化 (7.6s → 0.05s)
- 🎙️ **リアルタイム録音**: macシステム音声・マイク音声の同時録音対応
- ⚡ **GPU最適化**: CUDNN自動設定によるCUDA GPU完全対応
- 🤖 **高精度AI**: Faster Whisper大型モデルによる日本語高精度認識
- 🔧 **デーモンモード**: 常駐プロセスによるモデル読み込み時間ゼロ化
- 🌐 **API連携**: Next.js統合用REST API完備
- 📱 **Webインターフェース**: ブラウザベースのリアルタイム操作画面

## 必要な環境

- macOS/Linux
- Node.js 18+
- Python 3.8+
- uv (Python package manager)
- ffmpeg
- BlackHole（仮想オーディオドライバー）

## セットアップ

### 1. BlackHoleのインストール

```bash
brew install blackhole-2ch
```

### 2. uvのインストール

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
# または
brew install uv
```

### 3. プロジェクトのインストール

```bash
# Node.js依存関係
npm install
npm run build

# Python依存関係（Faster Whisper with CUDA support）
uv sync

# CUDA対応版のインストール（GPU利用可能の場合）
uv add "faster-whisper[cuda]"
```

## 🚀 使用方法

### 🌐 **Webインターフェース（推奨）**

```bash
npm start
```

ブラウザで http://localhost:3001/realtime にアクセス

**リアルタイム文字起こし機能**:
- 🎙️ ワンクリック録音開始/停止
- ⚡ 瞬間文字起こし表示（0.05秒）
- 📊 リアルタイム処理状況表示
- 💾 自動セッション保存

### 📱 CLIモード（開発者向け）

```bash
npm run dev -- --cli
```

対話式インターフェイスで録音を開始・停止：

```
音声リアルタイム文字起こし CLI ready!
Commands:
  start  - 録音開始（デーモン連携）
  stop   - 録音停止・瞬間変換
  status - 録音状態・デーモン状況確認
  sessions - 全セッション表示
  quit   - 終了
```

### 🎵 システム音声録音

**重要**: システム音声を録音するには、BlackHoleの設定が必要です。

1. **Audio MIDI Setup**を開く
2. 左下の「+」ボタンから「マルチ出力デバイス」を作成
3. 「Built-in Output」と「BlackHole 2ch」の両方にチェック
4. システム環境設定 → サウンド → 出力で「マルチ出力デバイス」を選択
5. 録音したい音声を再生
6. CLIで`start`コマンドを実行

### 🎤 マイク録音

マイク録音は追加設定なしで利用可能です：

```bash
npm run dev -- --cli
# start コマンドでマイク録音開始
```

### 📝 音声ファイル直接変換

```bash
# Whisper OSS版を使用
npm run dev -- --transcribe path/to/audio.wav

# Faster Whisperを直接使用（推奨：4倍高速）
uv run python src/python/faster_whisper_transcribe.py path/to/audio.wav --model base

# GPU使用の場合（さらに高速）
uv run python src/python/faster_whisper_transcribe.py path/to/audio.wav --model base --device cuda
```

### 🌐 APIサーバー起動

```bash
npm run dev
```

サーバーは `http://localhost:3001` で起動します。

## API エンドポイント

### 基本操作

- `POST /api/initialize` - システム初期化
- `GET /health` - ヘルスチェック

### 録音操作

- `POST /api/recording/start` - 録音開始
- `POST /api/recording/stop` - 録音停止・変換
- `GET /api/recording/status` - 録音状態確認

### セッション管理

- `GET /api/sessions` - 全セッション取得
- `GET /api/sessions/:id` - 特定セッション取得

### ファイル変換

- `POST /api/transcribe` - 音声ファイルアップロード・変換

## Next.js統合例

```typescript
// pages/api/recording.ts
import { RecordingManager } from 'recording-ai';

const manager = new RecordingManager();

export default async function handler(req, res) {
  await manager.initialize();
  
  if (req.method === 'POST') {
    const session = await manager.startRecording();
    res.json(session);
  }
}
```

## 設定

### Whisperモデル選択

#### Whisper OSS版（JavaScript）
```typescript
const manager = new RecordingManager('./data', 'Xenova/whisper-base');
```

利用可能なモデル：
- `Xenova/whisper-tiny` - 最軽量
- `Xenova/whisper-base` - 推奨
- `Xenova/whisper-small` - 高精度
- `Xenova/whisper-medium` - 更に高精度
- `Xenova/whisper-large-v3` - 最高精度

#### Faster Whisper（Python - 推奨）
```bash
# 依存関係チェック
uv run python src/python/faster_whisper_transcribe.py --check-deps

# 基本使用（CPU）
uv run python src/python/faster_whisper_transcribe.py audio.wav --model base

# GPU使用（CUDA）
uv run python src/python/faster_whisper_transcribe.py audio.wav --model base --device cuda

# 自動デバイス選択（推奨）
uv run python src/python/faster_whisper_transcribe.py audio.wav --model base --device auto
```

利用可能なモデル：
- `tiny` - 最軽量（~39MB）
- `base` - 推奨（~74MB）
- `small` - 高精度（~244MB）
- `medium` - 更に高精度（~769MB）
- `large-v2` - 最高精度（~1.5GB）
- `large-v3` - 最新モデル（~1.5GB）

### 🏆 パフォーマンス比較

| 実装モード | 処理速度 | 初期化時間 | メモリ使用量 | GPU対応 | 推奨用途 |
|------------|----------|------------|------------|---------|-----------|
| Whisper OSS | 7.6s | 3-5s | 高 | Limited | 軽量テスト |
| Faster Whisper | 1.8s | 3-5s | 中 | Yes | 単発処理 |
| **Whisperデーモン** | **0.05s** | **一度のみ** | **低** | **Full** | **本番運用** |

**デーモンモード優位性**:
- ⚡ **152倍高速**: 毎回のモデル読み込み不要
- 🔥 **瞬間レスポンス**: 0.05秒以内の文字起こし
- 💾 **メモリ効率**: モデル常駐による最適化
- 🎯 **ゼロ待機時間**: 初期化済み状態で待機

### 録音設定

```typescript
const config = {
  sampleRate: 16000,
  channels: 1,
  audioType: 'wav'
};
```

## ディレクトリ構造

```
src/
├── api/           # REST API
├── services/      # 主要サービス
├── types/         # TypeScript型定義
└── utils/         # ユーティリティ

data/
├── recordings/    # 録音ファイル
└── sessions/      # セッション情報
```

## 🔧 技術アーキテクチャ

### Whisperデーモンシステム

**アーキテクチャ概要**:
```
┌─────────────────┐    JSON    ┌──────────────────┐
│  TypeScript     │ ◄────────► │ Python Daemon    │
│  FasterWhisper  │    stdin/   │ whisper_daemon.py│
│  Service        │    stdout   │                  │
└─────────────────┘            └──────────────────┘
                                        │
                                   ┌────▼────┐
                                   │ Faster  │
                                   │ Whisper │ (常駐)
                                   │ Model   │
                                   └─────────┘
```

**主要コンポーネント**:
- `src/services/FasterWhisperService.ts`: TypeScript側デーモン制御
- `src/python/whisper_daemon.py`: Python常駐プロセス
- `src/python/faster_whisper_transcribe.py`: CUDNN最適化スクリプト

**パフォーマンス最適化**:
- モデル一度読み込み、メモリ常駐
- JSON通信による軽量プロトコル
- CUDNN動的ライブラリプリロード
- GPU メモリ最適化（70%割り当て制限）

### CUDNN GPU最適化

**自動ライブラリ検出**:
```python
# uv仮想環境のCUDNNライブラリ自動検出
site_packages = site.getsitepackages()[0]
nvidia_lib_paths = scan_nvidia_libraries(site_packages)

# ctypesによる動的ロード
for lib_path in cudnn_libraries:
    ctypes.CDLL(lib_path, mode=ctypes.RTLD_GLOBAL)
```

**GPU最適化設定**:
- CUDA メモリ分画: 70%制限でOOM防止
- cuDNN 決定論的モード: 再現性確保
- GPU リソース自動管理: エラー時CPU自動フォールバック

## 🛠️ トラブルシューティング

### 録音ファイルが無音の場合

**システム音声録音**:
1. BlackHoleが正しくインストールされているか確認
2. **Audio MIDI Setup**でマルチ出力デバイスが作成されているか確認
3. システム出力がマルチ出力デバイスに設定されているか確認
4. 録音中に音声が再生されているか確認

**マイク録音**:
1. マイクアクセス権限が許可されているか確認
2. マイクが正しく接続されているか確認

### Whisperモデルが読み込めない場合

```bash
# キャッシュクリア
rm -rf ~/.cache/huggingface/
```

### Whisperデーモン関連問題

**デーモンが起動しない場合**:
```bash
# uv環境確認
uv --version

# Python依存関係確認
uv run python src/python/whisper_daemon.py --check-deps

# 手動デーモンテスト
uv run python src/python/whisper_daemon.py
```

**CUDNN エラーが発生する場合**:
```bash
# NVIDIA ライブラリ確認
ls ~/.local/share/uv/python/*/site-packages/nvidia/cudnn/lib/

# ライブラリパス手動設定
export LD_LIBRARY_PATH="~/.local/share/uv/python/*/site-packages/nvidia/cudnn/lib:$LD_LIBRARY_PATH"
```

**GPU使用できない場合**:
```bash
# CUDA 環境確認
nvidia-smi
uv run python -c "import torch; print(torch.cuda.is_available())"

# CPU フォールバック（自動実行）
# GPUエラー時は自動的にCPUにフォールバックします
```

### Node.js AudioContext エラー

このエラーは解決済みです。wavetileライブラリを使用してNode.js環境でのオーディオ処理を行っています。

### 録音権限エラー

```bash
# macOSでマイクアクセス権限を確認
# システム環境設定 → セキュリティとプライバシー → プライバシー → マイク
# ターミナルまたはNode.jsにマイクアクセス権限を付与
```

## ライセンス

MIT License