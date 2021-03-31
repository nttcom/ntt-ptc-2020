## 動かし方

### 事前準備

ベンチマーカーは k6 という負荷試験ソフトウェアをベースにしているため、まず
https://k6.io/docs/getting-started/installation
からインストールする。

その他、スコア計算スクリプトとしてnodejsが必要なので、なければインストールしておく。

また、画像のアップロードも行うため
https://drive.google.com/file/d/1qXWQ-fwaKBD2HwmD14Fp3d_ydVb7c-8r/view?usp=sharing
を落としてinflateして、 `bench/images/` 配下に保存しておくこと。0-2499.pngまでの2500枚ある。

### 実行

負荷試験とスコア算出を実行する。

```
// 負荷試験実行、結果は score.json に吐き出される
$ k6 run --out json=./score.json scenario.js

// 先程の結果を利用してスコア解析する (hogeはtodo事項)
$  node result_parser.js score.json hoge
```
