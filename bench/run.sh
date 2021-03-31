#!/bin/bash
INITIALIZE_TIMEOUT_SEC=20
target_host="192.168.33.11"
bench_host=`hostname`

while getopts ht OPT
do
    case $OPT in
        t) FLG_STEP2="TRUE" ;;
        o) FLG_STEP3_LOAD="TRUE" ;;
        *) echo "Usage: $CMDNAME [-h] [-t] [-o]" 1>&2
           exit 1 ;;
    esac
done

echo "Going to benchmark to ${target_host}..."

### STEP1 initialize
message="STEP1: Start to Initialize DB..."
echo "${message}"

campaign=`curl --fail --max-time ${INITIALIZE_TIMEOUT_SEC} -H 'Content-Type: application/json' -X POST http://${target_host}/api/initialize -d '{}'`

if [ $? -ne 0 ]; then
    message="STEP1: Failed to initialize DB for ${target_host}\nAborting..."
    echo -e "${message}"

    exit 1
else
    message="STEP1: Succeeded in initializing DB for ${target_host}"
    echo ${message}
fi

## STEP2 アプリケーション互換性チェック

message="STEP2: Start to Check App Compatibility..."
echo ${message}

## file名のベースになる
filename=`date "+%Y%m%d_%H%M%S"`
if [ "$FLG_STEP2" = "TRUE" ]; then
    target_host=${target_host} /home/ptc_admin/apitest/endpoint.sh > /var/tmp/${filename}.tavern.log

    if [ $? -ne 0 ]; then
        message="STEP2: Failed to check compatibility for ${target_host}"
        echo ${message}

        message=`sed "s/'//g" /var/tmp/${filename}.tavern.log`
        echo ${message}

        exit 1
    else
        message="STEP2: Succeeded in checking compatibility for ${target_host}"
        echo ${message}
    fi
else
    message="STEP2: Skipped! (to run STEP2, add -t option)"
    echo ${message}
fi

### STEP3 ベンチマーク60秒
message="STEP3: Start a benchmark..."
echo ${message}

if [ "$FLG_STEP3_LOAD" = "TRUE" ]; then
    scenario_file="scenario.js"
else
    scenario_file="scenario.local.js"
fi

case "$campaign" in
    "1")
    message="STEP3: Campaign Specified: Level 1"
    echo ${message}
    K6_AUDIENCE_RATE=1 K6_ARTISTS_RATE=1 K6_OWNERS_RATE=1 K6_OLD_USERS_RATE=1 \
        K6_AUDIENCE_TIMEUNIT=2s K6_ARTISTS_TIMEUNIT=6s K6_OWNERS_TIMEUNIT=12s K6_OLD_USERS_TIMEUNIT=6s \
        K6_VU=1 TARGET_URL="http://${target_host}" k6 run --out json=/var/tmp/${filename}.json ${scenario_file}
    ;;
    "2")
    message="STEP3: Campaign Specified: Level 2"
    echo ${message}
    K6_AUDIENCE_RATE=3 K6_ARTISTS_RATE=2 K6_OWNERS_RATE=1 K6_OLD_USERS_RATE=1 \
        K6_AUDIENCE_TIMEUNIT=1s K6_ARTISTS_TIMEUNIT=1s K6_OWNERS_TIMEUNIT=4s K6_OLD_USERS_TIMEUNIT=2s \
        K6_VU=2 TARGET_URL="http://${target_host}" k6 run --out json=/var/tmp/${filename}.json ${scenario_file}
    ;;
    "3")
    message="STEP3: Campaign Specified: Level 3"
    echo ${message}
    K6_AUDIENCE_RATE=18 K6_ARTISTS_RATE=12 K6_OWNERS_RATE=2 K6_OLD_USERS_RATE=6 \
        K6_AUDIENCE_TIMEUNIT=1s K6_ARTISTS_TIMEUNIT=1s K6_OWNERS_TIMEUNIT=1s K6_OLD_USERS_TIMEUNIT=1s \
        K6_VU=6 TARGET_URL="http://${target_host}" k6 run --out json=/var/tmp/${filename}.json ${scenario_file}
    ;;
    *)
    message="STEP3: No Campaign Specified: Campaign Level 1"
    echo ${message}
    K6_AUDIENCE_RATE=1 K6_ARTISTS_RATE=1 K6_OWNERS_RATE=1 K6_OLD_USERS_RATE=1 \
        K6_AUDIENCE_TIMEUNIT=2s K6_ARTISTS_TIMEUNIT=6s K6_OWNERS_TIMEUNIT=12s K6_OLD_USERS_TIMEUNIT=6s \
        K6_VU=1 TARGET_URL="http://${target_host}" k6 run --out json=/var/tmp/${filename}.json ${scenario_file}
    ;;
esac

if [ $? -ne 0 ]; then
    message="STEP3: Failed to perform a benchmark for ${target_host}"
    echo ${message}

    exit 1
else
    message="STEP3: Succeeded in benchmark for ${target_host}. Caluculating score..."
    echo ${message}

    node result_parser.local.js /var/tmp/${filename}.json > "/var/tmp/${filename}.score.txt"

    score=`cat "/var/tmp/${filename}.score.txt" | head -n 1`

    message=`sed "s/'//g" /var/tmp/${filename}.score.txt | tail -n +2`
    message="Score: ${score}\nHere are the breakdown of results:\n\n${message}\n"
    echo -e "${message}"
fi
