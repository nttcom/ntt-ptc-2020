## 開発情報
### テスト用ユーザ
|username|password|role|
|:-----|:-------|:-------|
|user01|password|audience|
|user02|password|audience|
|user03|password|artist  |
|sawady|password|owner   |

## テスト

### テストの実行方法

app=[python|ruby|nodejs|golang] docker-compose up --exit-code-from apitest apitest

### テストの追加

- 新規テストファイルの作成場合

./app/apitest/tavern/ 配下に `test_***.tavern.yaml` を作成

- 既存テストファイルへの追記の場合

該当する `./app/apitest/tavern/test_***.tavern.yaml` に追記

- 変数や設定を変える場合

`./app/apitest/tavern/config.yaml` を編集
