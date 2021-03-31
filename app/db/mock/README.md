
## save

```bash
mysqldump --skip-column-statistics -h 127.0.0.1 -u username -p app --hex-blob > dump_data.sql
```

## load

```bash
mysql -h 127.0.0.1 -u username -p app < dump_data.sql
```
