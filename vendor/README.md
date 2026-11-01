# vendor（外部の部品）

外から取ってきた部品を、手を加えずにそのまま置く。中身を書き換えない。

## JSZip 3.10.1（`jszip.min.js`）

zip を作る・読むために使う（STEP 7）。zip を作る・読むときだけ読み込む。

| 項目 | 内容 |
|---|---|
| 取得元 | npm 公式の配布物 https://registry.npmjs.org/jszip/-/jszip-3.10.1.tgz の `dist/jszip.min.js` |
| 取得日 | 2026-11-01 |
| 配布物の検証 | tgz の SHA-512 が npm の `dist.integrity`（`sha512-xXDvecyTpGLrqFrvkrUSoxxfJI5AH7U8zxxtVclpsUtMCq4JQ290LY8AW5c7Ggnr/Y/oK+bQMbqK2qmtk3pN4g==`）と一致 |
| `jszip.min.js` の SHA-256 | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |
| ライセンス | MIT と GPLv3 の選択制。**MIT を選択**。原文は `LICENSE-jszip.markdown`（配布物の `LICENSE.markdown` をそのまま複製） |

`jszip.min.js` の中には、次の部品も含まれている。ライセンス文は `LICENSE-jszip-bundled.txt` にまとめた（それぞれ npm 公式の配布物から複製。配布物の SHA-512 は npm の `dist.integrity` と一致を確認）。

| 部品 | 版 | ライセンス |
|---|---|---|
| pako | 1.0.11 | MIT（zlib 由来の部分は Zlib） |
| lie | 3.3.0 | MIT |
| immediate | 3.0.6 | MIT |

### 中身が変わっていないかの確かめ方

PowerShell で次を実行し、上の SHA-256 と同じになることを確かめる。

```
(Get-FileHash vendor/jszip.min.js -Algorithm SHA256).Hash
```
