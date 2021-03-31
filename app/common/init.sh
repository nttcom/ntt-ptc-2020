#!/bin/sh

# TODO: 本番時に設定を書き換えること(これはDocker実行向け)
# ROOT_DIR=$(cd $(dirname $0)/..; pwd)
# DB_DIR="$ROOT_DIR/db"
# BENCH_DIR="$ROOT_DIR/bench"

MYSQL_DATABASE_NAME=app
MYSQL_USER=username
MYSQL_PASSWORD=password
MYSQL_ROOT_PASSWORD=rootpassword

mysql -h db -u$MYSQL_USER -p$MYSQL_PASSWORD  -e "DROP DATABASE ${MYSQL_DATABASE_NAME}"
mysql -h db -u$MYSQL_USER -p$MYSQL_PASSWORD  -e "CREATE DATABASE ${MYSQL_DATABASE_NAME}"
mysql -h db -u$MYSQL_USER -p$MYSQL_PASSWORD  $MYSQL_DATABASE_NAME < scripts/init.sql
