#!/bin/bash

SCRIPT_PATH=$(cd $(dirname $0); pwd)
export PYTHONPATH=$PATHONPATH:$SCRIPT_PATH/scripts
export IMAGE_PATH=$SCRIPT_PATH/images
export url="http://$app-app:5000/api"
export expired_token="eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE1OTk2MzY2NDMsImlhdCI6MTU5OTYzMzA0MywidXNlcm5hbWUiOiJzYXdhZHkiLCJyb2xlIjoib3duZXIifQ.opVQE0FKG9caqZrgqGewJEZabHYuwzCs1M9Y_Zig3WY"
export jwt_secret_token="da4855bf92b81fafaa170ba2aa9757c4"

cd $SCRIPT_PATH
tavern-ci --tavern-global-cfg=tavern/config.yaml -W ignore::pytest.PytestDeprecationWarning
