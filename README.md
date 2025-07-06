# Recording AI - Mac System Audio Recorder with Whisper

TypeScript製のmacシステム音声録音・音声認識システム。OpenAI WhisperのOSS版を使用して無料で音声をテキストに変換します。

## 特徴

- 🎙️ macシステム音声・マイク音声の録音（BlackHole使用）
- 🤖 Whisper OSS版による高精度音声認識（日本語対応）
- 📝 音声ファイルの保存・管理
- 🌐 Next.js統合用REST API
- 🔧 CLI・APIサーバー両対応

## 必要な環境

- macOS
- Node.js 18+
- ffmpeg
- BlackHole（仮想オーディオドライバー）

## セットアップ

### 1. BlackHoleのインストール

```bash
brew install blackhole-2ch
```

### 2. プロジェクトのインストール

```bash
npm install
npm run build
```

## 使用方法

### 📱 CLIモード（推奨）

```bash
npm run dev -- --cli
```

対話式インターフェイスで録音を開始・停止できます：

```
Recording AI CLI ready!
Commands:
  start  - 録音開始
  stop   - 録音停止
  status - 録音状態確認
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
npm run dev -- --transcribe path/to/audio.wav
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

```typescript
const manager = new RecordingManager('./data', 'Xenova/whisper-base');
```

利用可能なモデル：
- `Xenova/whisper-tiny` - 最軽量
- `Xenova/whisper-base` - 推奨
- `Xenova/whisper-small` - 高精度
- `Xenova/whisper-medium` - 更に高精度
- `Xenova/whisper-large-v3` - 最高精度

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

## トラブルシューティング

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