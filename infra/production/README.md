# Build infra
このディレクトリは，n-ptc環境のbuild/deployment関係を格納するものです
Ansibleを単体で実行するときはこのディレクトリで行うこと。

## requirement
- ansible >= 2.8
- cowsay :)
- Terraform（本番環境を起動するとき）

## how to create master image
### before do
#### create vms
- GCP上で，VMを作成する
  - Ubuntu 18.04
  - `apt install` 等が行われるため，highcpu-4以上を推奨
  - プロジェクトの公開鍵をブロックし，Admin用公開鍵を入れておく
- Pipenv使って依存関係を入れておく
- GoogleDriveから，Admin用秘密鍵をdownloadし，keysディレクトリに入れる
- group_vars以下のファイルについて， `ansible-vault decrypt` しておく

#### download some seed data
- Google driveからいろいろとダウンロードしてくる
  - https://drive.google.com/drive/u/0/folders/1E9QRuASgzI73MEw8xUiVf91IzloinEjC
    - `all_revoked_token.list` を `revoked_token.list` にrenameし，  `roles/deploy_app/files/` に配置
    - それ以外の `*.json` を `roles/bench/files` に配置
  - https://drive.google.com/drive/u/0/folders/1ya54pxH8ANMCiy8ld-GCU_SvAVooDPOa
    - images.tgzを， `roles/bench/files` に配置
  - https://drive.google.com/drive/u/0/folders/1ic8iocY1_Udmcl1fi9agQeo6K0q9WIjZ
    - dump_data.tgzを，中身のファイルを `seed.sql` にrename↓上で，`seed.sql.tgz`と圧縮した上で`roles/deploy_app/files`に配置

### exec ansible
- Pipenvを有効化
  - `pipenv sync`
  - `pipenv shell`
- ansibleを実行
  - `ansible-playbook -i hosts -l app,bench site.yml`

### hosts hierarchy
- all
  - app
  - portal
  - bench

### take snapshot
- Ansible適用後のappについて，snapshotを取得する
  - このsnapshotは，後段のterraformによるデプロイに必要です

## clone vms by terraform
### before do
- NW情報をダンプします
```
terraform import google_compute_network.nisucon nisucon
terraform import google_compute_firewall.competition bench
terraform import google_compute_firewall.competition competition
terraform import google_compute_subnetwork.management management
terraform import google_compute_subnetwork.competition competition
```
- ディスクのスナップショット名や，デプロイするVM数を変更します
  - main.tfのvariableをいじってください
- IAMからサービスアカウントを作って，JSON形式でダウンロードし， `gcloud-auth.key` という名前で保存します

## exec terraform
- VMを一斉でプロイします
```
terraform apply
```

