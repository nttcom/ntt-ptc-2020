#!/bin/bash

SLEEP_TIME=10
INITIALIZE_TIMEOUT_SEC=20
REDIS_HOST=${ENV_REDIS_HOST}
DB_HOST=${ENV_DB_HOST}
DB_USER=${ENV_DB_USER}
DB_PASS=${ENV_DB_PASS}
DB_NAME=dashboard
SLACK_WEBHOOK_URL='https://hooks.slack.com/services/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'

# DB格納用
STATUS_SUCCESS=0
STATUS_FAIL=1

while true
do
    message=`redis-cli -h ${REDIS_HOST} rpop benchqueue`

    if [ -n "$message" ]; then
        # $messageはCSV形式で"1,0.0.0.0"を持つ、
        # 1つ目のFieldがチームID、2つ目がベンチ対象IP
        team_id=`echo $message | awk '{split($1, a, ","); print a[1]}'`
        target_host=`echo $message | awk '{split($1, a, ","); print a[2]}'`
        team_name=`echo $message | awk '{split($1, a, ","); print a[3]}'`

        bench_host=`hostname`

        echo "Going to benchmark to ${target_host} tuned by team_id:  ${team_id} ..."

        ### STEP1 initialize
        command_log=`date`
        message="\nSTEP1: Start to Initialize DB..."

        curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 1を開始します\"}" ${SLACK_WEBHOOK_URL}

        command_log+="${message}\n"
        echo "${message}"
        campaign=`curl --fail --max-time ${INITIALIZE_TIMEOUT_SEC} -H 'Content-Type: application/json' -X POST http://${target_host}/api/initialize -d '{}'`

        if [ $? -ne 0 ]; then
            message="STEP1: Failed to initialize DB for ${target_host}\nEnd of benchmark..."
            echo ${message}
            command_log+="${message}\n"

            curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 1が失敗しました\"}" ${SLACK_WEBHOOK_URL}

            mysql -u${DB_USER} -p${DB_PASS} dashboard -h ${DB_HOST} \
              -e "INSERT INTO results (team_id, score, status, command_result, finished_date, bench_host) VALUES (${team_id}, 0, ${STATUS_FAIL}, '${command_log}', now(), '${bench_host}');"

            sleep 5
            continue
        else
            message="STEP1: Succeeded in initialization of DB for ${target_host}\n"
            echo ${message}
            command_log+="${message}\n"
        fi

        ## STEP2 アプリケーション互換性チェック

        command_log+=`date`
        message="STEP2: Start to Check App Compatibility...\n"
        command_log+="\n${message}\n"

        ## file名のベースになる
        filename=`date "+%Y%m%d_%H%M%S"`

        echo ${message}

        curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 2を開始します\"}" ${SLACK_WEBHOOK_URL}

        target_host=${target_host} /home/ptc_admin/apitest/endpoint.sh > /var/tmp/${filename}.tavern.log

        if [ $? -ne 0 ]; then
            message="STEP2: Failed to check compatibility for ${target_host}"
            echo ${message}
            command_log+="${message}\n"

            curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 2が失敗しました\"}" ${SLACK_WEBHOOK_URL}

            message=`sed "s/'//g" /var/tmp/${filename}.tavern.log`
            echo ${message}
            command_log+="${message}\n"

            mysql -u${DB_USER} -p${DB_PASS} dashboard -h ${DB_HOST} \
              -e "INSERT INTO results (team_id, score, status, command_result, finished_date, bench_host) VALUES (${team_id}, 0, ${STATUS_FAIL}, '${command_log}', now(), '${bench_host}');"

            sleep 5
            continue
        else
            message="STEP2: Succeeded in checking compatibility for ${target_host}"
            echo ${message}
            command_log+="${message}\n"
        fi

        ### STEP3 ベンチマーク60秒
        command_log+=`date`
        message="STEP3: Start to perform a benchmark...\n"
        echo ${message}
        command_log+="\n${message}"

        case "$campaign" in
          "1")
            message="STEP3: Campaign Specified: Level 1"
            echo ${message}
            command_log+="${message}"
            curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 3 (Campaign Level 1) を開始します\"}" ${SLACK_WEBHOOK_URL}
            K6_AUDIENCE_RATE=1 K6_ARTISTS_RATE=1 K6_OWNERS_RATE=1 K6_OLD_USERS_RATE=1 \
              K6_AUDIENCE_TIMEUNIT=2s K6_ARTISTS_TIMEUNIT=6s K6_OWNERS_TIMEUNIT=12s K6_OLD_USERS_TIMEUNIT=6s \
              K6_VU=1 TARGET_URL="http://${target_host}" k6 run --out json=/var/tmp/${filename}.json scenario.js
            ;;
          "2")
            message="STEP3: Campaign Specified: Level 2"
            echo ${message}
            command_log+="${message}"
            curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 3 (Campaign Level 2) を開始します\"}" ${SLACK_WEBHOOK_URL}
            K6_AUDIENCE_RATE=3 K6_ARTISTS_RATE=2 K6_OWNERS_RATE=1 K6_OLD_USERS_RATE=1 \
              K6_AUDIENCE_TIMEUNIT=1s K6_ARTISTS_TIMEUNIT=1s K6_OWNERS_TIMEUNIT=4s K6_OLD_USERS_TIMEUNIT=2s \
              K6_VU=2 TARGET_URL="http://${target_host}" k6 run --out json=/var/tmp/${filename}.json scenario.js
            ;;
          "3")
            message="STEP3: Campaign Specified: Level 3"
            echo ${message}
            command_log+="${message}"
            curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 3 (Campaign Level 3) を開始します\"}" ${SLACK_WEBHOOK_URL}
            K6_AUDIENCE_RATE=18 K6_ARTISTS_RATE=12 K6_OWNERS_RATE=2 K6_OLD_USERS_RATE=6 \
              K6_AUDIENCE_TIMEUNIT=1s K6_ARTISTS_TIMEUNIT=1s K6_OWNERS_TIMEUNIT=1s K6_OLD_USERS_TIMEUNIT=1s \
              K6_VU=6 TARGET_URL="http://${target_host}" k6 run --out json=/var/tmp/${filename}.json scenario.js
            ;;
          *)
            message="STEP3: No Campaign Specified: Campaign Level 1"
            echo ${message}
            command_log+="${message}"
            curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 3 (Campaign Level 1) を開始します\"}" ${SLACK_WEBHOOK_URL}
            K6_AUDIENCE_RATE=1 K6_ARTISTS_RATE=1 K6_OWNERS_RATE=1 K6_OLD_USERS_RATE=1 \
              K6_AUDIENCE_TIMEUNIT=2s K6_ARTISTS_TIMEUNIT=6s K6_OWNERS_TIMEUNIT=12s K6_OLD_USERS_TIMEUNIT=6s \
              K6_VU=1 TARGET_URL="http://${target_host}" k6 run --out json=/var/tmp/${filename}.json scenario.js
            ;;
        esac

        if [ $? -ne 0 ]; then
            message="STEP3: Failed to perform a benchmark for ${target_host}"
            echo ${message}
            command_log+="${message}\n"

            curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークSTEP 3が失敗しました\"}" ${SLACK_WEBHOOK_URL}

            mysql -u${DB_USER} -p${DB_PASS} dashboard -h ${DB_HOST} \
              -e "INSERT INTO results (team_id, score, status, command_result, finished_date, bench_host) VALUES (${team_id}, 0, ${STATUS_FAIL}, '${command_log}', now(), '${bench_host}');"

            sleep 5
            continue
        else
            message="STEP3: Succeeded in benchmark for ${target_host}. Caluculating score...\n"
            command_log+="\n${message}\n"

            node result_parser.js /var/tmp/${filename}.json "${team_id}" > "/var/tmp/${filename}.score.txt"

            score=`cat "/var/tmp/${filename}.score.txt" | head -n 1`

            message=`sed "s/'//g" /var/tmp/${filename}.score.txt | tail -n +2`
            command_log+="Score: ${score}\nHere are the breakdown of results:\n\n${message}\n"

            curl -X POST -d "payload={\"text\": \"${team_name} に対するベンチマークが完了しました。結果はPortalから確認ください。\"}" ${SLACK_WEBHOOK_URL}

            mysql -u${DB_USER} -p${DB_PASS} dashboard -h ${DB_HOST} \
              -e "INSERT INTO results (team_id, score, status, command_result, finished_date, bench_host) VALUES (${team_id}, ${score}, ${STATUS_SUCCESS}, '${command_log}', now(), '${bench_host}');"
        fi
    else
        echo "Seems there's no benchmark request in the queue. Let's just wait for ${SLEEP_TIME} secs..."
        sleep ${SLEEP_TIME}
    fi
done
