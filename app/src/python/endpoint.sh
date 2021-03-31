#!/bin/bash

gunicorn -w 5 --thread 5 -b 0.0.0.0:5000 app:app
