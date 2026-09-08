# Check＆Stock

家庭の消耗品（医薬品・日用品・食品・飲料）の棚卸と買い物を分けるアプリです。

家の在庫として数える単位は **アイテム**（例: ティッシュ）です。
店やネットで買うものは **商品** です。ひとつのアイテムに複数の商品を付けられます。
買った記録は履歴に残り、在庫数は次の Check で合わせます。

詳細は [docs/requirements.md](docs/requirements.md) を参照してください。

## 画面

| 画面 | 役割 |
|------|------|
| Check | 場所・頻度ごとに数量を入れる（在庫の正）。入力が揃うと、まず LOHACO で買うものを選べる。 |
| Select | 足りないアイテムについて、先に LOHACO 対象を選び、残りは商品を選ぶか購入先を入力して確定する。 |
| Shopping List | 店舗向けの買い物リスト。買ったら完了する。 |
| Pick Up | ネット向けの受け取りリスト。受け取ったら完了する。 |
| 設定 | アイテム、商品、購入・受け取り履歴、頻度・場所・カテゴリ・購入先。 |

発注（Select）と Shopping List / Pick Up は別タブです。

## リポジトリ

静的 HTML / CSS / JS と Supabase 用 SQL です。`index.html` を開けば動きます。

現行の実装は、発注と買い物・受け取りを分け、商品と購入履歴を設定で扱います。
クラウド同期には `products` / `purchase_history` テーブルが必要です。
既存プロジェクトへのスキーマ追加は [`supabase/products.sql`](supabase/products.sql) と [`supabase/fulfillment.sql`](supabase/fulfillment.sql) を SQL Editor で実行してください（全文の `setup.sql` は再実行しない）。
Realtime の行イベント配信を止めるには、続けて [`supabase/realtime.sql`](supabase/realtime.sql) を実行してください。同期は Broadcast と、タブが前面に戻ったときの pull で行います。

## Supabase プロジェクトの切り替え

新しいプロジェクトへ付け替える手順です。

1. 新しいプロジェクトの SQL Editor で [`supabase/setup.sql`](supabase/setup.sql) を実行する（新規プロジェクトではこれが本体）。続けて [`supabase/realtime.sql`](supabase/realtime.sql) を実行する。
2. アプリの **設定 → クラウド接続** に Project URL と anon public key を入れて再接続する。空のプロジェクトなら、今の端末のデータを送ります。
3. GitHub Secrets の `SUPABASE_PROJECT_ID` を新しいプロジェクト ID（URL のサブドメイン）に更新し、必要なら `SUPABASE_ACCESS_TOKEN` も更新する。
4. Actions の **Deploy Supabase Functions** を手動実行して `lohaco-product` を新しいプロジェクトへ出す。
5. 他の端末でも同じ URL と key で再接続する。全端末の初期設定を書き換えたい場合は `js/constants.js` の `SUPABASE_CONFIG` と `supabase/config.toml` の `project_id` も更新する。
