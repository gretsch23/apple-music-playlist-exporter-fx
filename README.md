# Apple Music Playlist Exporter (Firefox Extension)

Web版のApple Musicから、自分のプレイリストをワンクリックでCSVファイルとしてダウンロードできるFirefox用の機能拡張です。

元のプロジェクト（danissimov/backup_playlists）は動かすのにPythonの知識やDevToolsからのcURL取得が必要でしたが、この機能拡張を使えばブラウザ上で誰でも安全かつ簡単にバックアップが取れます。

## 特徴
- **完全ブラウザ完結**: 面倒なトークンのコピーやコマンド操作、Python環境の構築は不要です。
- **安心のローカル処理**: 取得したデータやログイン情報は外部サーバーに送信されず、ブラウザ内だけで安全に処理されます。
- **使い慣れたCSV形式**: Excelやスプレッドシートでそのまま開いて管理・閲覧できます。

## ファイル構成
- `manifest.json` : 拡張機能の設定ファイル
- `background.js` : バックグラウンドで動作するスクリプト
- `apple-content.js` : Apple Musicのページで動作するスクリプト
- `apple-music-interceptor.js` : 通信（APIレスポンス）をキャッチしてデータを処理するスクリプト

## 使い方（開発者モードでの読み込み）
1. このリポジトリのコードを ZIP などで一式ダウンロードし、解凍します。
2. Firefoxを開き、URL欄に `about:debugging` と入力して開きます。
3. 左メニューの「このFirefox（This Firefox）」をクリックします。
4. 「一時的な拡張機能の読み込み（Load Temporary Add-on...）」ボタンを押します。
5. 解凍したフォルダ内にある `manifest.json` を選択して読み込ませます。
6. Web版Apple Music（ https://apple.com ）を開き、ログインします。
7. プレイリスト画面を開き、拡張機能のボタンを押すとCSVファイルがダウンロードされます。

## ライセンス
MIT License (元のプロジェクトのライセンスに準拠)
