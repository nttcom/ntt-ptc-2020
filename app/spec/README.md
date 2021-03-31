## 仕様の表現について
仕様の記載には、Swaggerを用いている。

## Swagger上で表現されていない仕様
Swaggerで表現できないが、採用している仕様は次の通り。
- JWTトークンの署名方式は HMAC-SHA256
- 400系、500系のレスポンスに対するレスポンスボディは定義されない

## 編集方法

Swagger Editorを用いて編集すると、プレビューも同時確認できる。
Dockerから起動して、ブラウザでアクセスすればいい。

```
docker run -d -p 80:8080 swaggerapi/swagger-editor
```

## HTMLの出力

```
docker build . -t redoc-cli:latest
docker run --rm  --name redoc-cli redoc-cli:latest cat spec.html > spec.html
```


