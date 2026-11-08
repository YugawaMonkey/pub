# ルートヒストリー — GitHub Pagesリリース

2024年・2025年の年切り替え、旅行別地図、統計を収録した静的サイトです。ビルド、npm、APIキーは不要です。2026年は追加予定として表示します。

## 公開する前に

地図HTMLには詳細な緯度経度と日時が含まれます。公開後は訪問先・生活圏を第三者が閲覧・取得できます。GPX原本を含めなくても位置情報は公開されます。公開してよい記録か確認してください。

## 配置・公開

1. ZIPを展開します。ZIPファイル自体ではなく、展開した中身をGitHubリポジトリのmainブランチ直下へアップロードしてください。index.html、years.js、2024フォルダーが同じ階層に並ぶ状態です。既存のサイトがある場合は専用リポジトリを用意してください。
2. ドットで始まる .nojekyll も含めます。ブラウザーのアップロードで見えない場合は、リポジトリで Add file → Create new file から .nojekyll という名前のファイルを作成してください（空行だけでも可）。
3. Settings → Pages → Build and deployment → Source を Deploy from a branch に設定します。
4. Branch を main、フォルダーを /(root) にして Save を押します。
5. デプロイ完了後、Pages設定に表示されるURLを開きます。プロジェクトサイトなら通常 https://ユーザー名.github.io/リポジトリ名/ です。

index.html がリポジトリ内の github-pages-release フォルダーの下にならないようにしてください。docsフォルダーで公開したい場合は中身をdocsに置き、公開フォルダーを /docs に変更してください。

## 動作確認

- 初回は2025年が表示されること
- 年選択で2024年に切り替わること
- 旅行詳細を開き、上部の「年間地図に戻る」で戻れること
- レポートがHTMLで開けること

背景の地理院タイルにはネット接続が必要です。すべての内部リンクは相対パスで、リポジトリ名の変更にも対応します。年別ファイルとフォルダーの配置を保ってください。

## 翌年の追加

[年の追加方法](年の追加方法.md)を参照してください。2026年のGPXを集計して年別ページを作成した後、years.js の該当行を更新します。GPXを置くだけで自動解析される構成ではありません。

## 同梱内容

index.html：入口／years.js：年一覧／2025年の年間・旅行地図／2024フォルダー：2024年の年間・旅行地図／HTML・Markdownレポート／集計JSON／.nojekyll：Jekyll変換の無効化／THIRD_PARTY_NOTICES.txt：出典・ライセンス。元GPXや作業用データ、ローカルサーバーは含みません。

## 公式手順

https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
