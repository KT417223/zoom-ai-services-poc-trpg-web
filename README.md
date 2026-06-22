# TRPG Transcript Analyzer PoC

Zoom AI Services / Zoom Scribe API の文字起こし結果を入力として想定した、TRPGセッション解析PoCです。

## Demo

このアプリは `HTML/CSS/JavaScript` だけで動く静的Webアプリです。GitHub Pagesで公開できます。

## GitHub Pagesで公開する手順

1. このフォルダの内容をGitHubリポジトリにpushします。
2. GitHubのリポジトリ画面で `Settings` を開きます。
3. 左メニューの `Pages` を開きます。
4. `Build and deployment` の `Source` を `Deploy from a branch` にします。
5. `Branch` を `main`、フォルダを `/ (root)` にして保存します。
6. 数十秒から数分後に、PagesのURLが表示されます。

公開URLは通常、次の形式です。

```text
https://<github-user>.github.io/<repository-name>/
```

## ローカルで開く

`index.html` をブラウザで直接開くと動作します。

ローカルサーバーで確認する場合:

```powershell
python -m http.server 8000
```

その後、ブラウザで次を開きます。

```text
http://localhost:8000/
```

## 現在対応している抽出パターン

- `1d100`
- `42です`
- `結果は42`
- `出目42`
- `目標値60`
- `SAN60`
- `成功`
- `失敗`
- `SAN減少なし`
- `SAN-1`
- `SANが3減少`
- `HP-2`
