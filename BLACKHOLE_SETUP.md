# BlackHole設定ガイド

BlackHoleは仮想オーディオドライバーで、macのシステム音声を録音するために使用します。

## 📥 インストール手順

### 方法1: Homebrew（推奨）
```bash
brew install --cask blackhole-2ch
```

### 方法2: 手動ダウンロード
1. https://existential.audio/blackhole/ にアクセス
2. "BlackHole 2ch" をダウンロード
3. .pkgファイルを実行してインストール
4. **再起動が必要です**

## ⚙️ システム設定

### 1. Audio MIDI Setup（オーディオMIDI設定）を開く
```bash
open "/Applications/Utilities/Audio MIDI Setup.app"
```

### 2. Multi-Output Device（マルチ出力デバイス）を作成
1. Audio MIDI Setupで左下の「+」ボタンをクリック
2. "Create Multi-Output Device"を選択
3. 以下を選択：
   - ✅ Built-in Output（スピーカー）
   - ✅ BlackHole 2ch
4. 名前を「BlackHole + Speakers」に変更

### 3. システム出力をBlackHoleに設定
1. システム環境設定 → サウンド → 出力
2. 「BlackHole + Speakers」を選択

## 🎙️ 録音設定

### コード側の設定更新

現在のAudioRecorderクラスを以下のように更新します：

```typescript
// BlackHole使用時の録音設定
const ffmpegArgs = [
  '-f', 'avfoundation',
  '-i', ':0', // BlackHoleからの音声入力
  '-ar', '16000',
  '-ac', '1',
  '-c:a', 'pcm_s16le',
  '-y',
  outputPath
];
```

### 利用可能なデバイス確認
```bash
ffmpeg -f avfoundation -list_devices true -i ""
```

## 🔧 トラブルシューティング

### 問題1: 音が聞こえない
- Multi-Output Deviceで「Built-in Output」も選択されているか確認
- 「Use This Device For Sound Output」にチェック

### 問題2: 録音できない
- システム出力がBlackHoleに設定されているか確認
- 録音したいアプリの音声が再生されているか確認

### 問題3: アクセス許可エラー
- システム環境設定 → セキュリティとプライバシー → マイク
- recording-aiアプリにアクセスを許可

## 📝 使用方法

### 1. システム音声録音
```bash
npm run dev -- --cli
# CLI起動後
start  # 録音開始
stop   # 録音停止・音声認識
```

### 2. API経由
```bash
curl -X POST http://localhost:3001/api/recording/start
curl -X POST http://localhost:3001/api/recording/stop
```

### 3. 特定アプリの音声録音
1. 録音したいアプリ（例：YouTube、Spotify）を再生
2. 上記の録音コマンドを実行
3. アプリの音声が録音される

## ⚠️ 注意点

1. **再起動必須**: BlackHoleインストール後は必ず再起動
2. **音声出力**: Multi-Output Device設定で通常のスピーカーも選択
3. **録音権限**: macOSのプライバシー設定でマイクアクセスを許可
4. **音質**: システム音声録音は元音源の品質に依存

## 🎯 テスト方法

1. YouTubeやSpotifyで音楽を再生
2. 録音を開始
3. 数秒後に停止
4. 音声認識結果を確認

これでmacのシステム音声（アプリからの音声出力）を録音・音声認識できます！