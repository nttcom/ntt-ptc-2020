## frontend

### Project setup

npmで必要なパッケージをダウンロードします  
npmがない場合は、Homebrew等でNode.jsをインストールしてください

```
npm install
```

Vue.jsはデフォルトでWebサーバが http://localhost:8080 で動作します  
一方で、バックエンドのアプリは http://localhost:5000 で動作するため、CORSを突破する必要があります

#### Python

バックエンドにPythonを使用してフロントエンドを開発する場合、flask-corsのインストール + 修正が必要です

```
pip install -U flask-cors
```

```python
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app, supports_credentials=True, origins='http://localhost:8080')
```

#### Ruby

バックエンドにRubyを使用してフロントエンドを開発する場合、sinatra-cross_originのインストール + 修正が必要です  
[Adding CORS configuration to a Sinatra app | by Simmi Badhan | Addval Labs | Medium](https://medium.com/addval-labs/adding-cors-configuration-to-a-sinatra-app-1ed426e2c028)

### Compiles and hot-reloads for development

Vue.jsのWebサーバは

```
npm run serve
```

で起動でき、 http://localhost:8080/ で動作します  
なお、バックエンドをローカルで動作させている場合は、main.jsの

```javascript
Vue.prototype.$apiUrl = "/api";
```

を

```javascript
Vue.prototype.$apiUrl = "http://localhost:5000/api";
```

などに変更してください

### Compiles and minifies for production

minifyされたファイルを生成するには

```
npm run build
```

minifyされていないファイルを生成するには

```
npm run build-dev
```

を実行してください

### Deploy to production

```
deploy_to_backend.sh
```

でdist配下をバックエンドのアプリが参照するpublicディレクトリにコピーする

### Run your tests

```
npm run test
```

未実装

### Lints and fixes files

```
npm run lint
```

### Customize configuration

[Configuration Reference](https://cli.vuejs.org/config/) を参照のこと
