# Portal

## Getting Started - Browse and Register Team

```bash
git pull this/repo
cd portal
cp .env.example .env
docker-compose up -d
open http://localhost:9292/admin  # use `ncomadmin@adminpassword` for basic
```

In http://localhost:9292/admin , please input `username,password` in the register form and enter.

After that,

```bash
open http://localhost:9292/login
```

you can logged-in used by `username` and `password`.

## Development

### requirements

- Ruby 2.6
- mysql
- redis

### how to run

1. `bundle install --path .bundle`
2. copy `.env.example` to `.env` and edit secret params
3. create database `dashboard`
4. `bundle exec rackup`
5. access localhost:9292

### daemonize

1. put `nisucon-portal.service` to systemd config dir & `systemd daemon-reload`
2. put `nisucon-portal.nginx` to nginx setting dir & restart nginx
3. access to https://portal.ncom.dev/
