FROM python:3.7.3

ARG project_dir=/app/
ARG test_dir=apitest
WORKDIR $project_dir

COPY $test_dir/requirements.txt $project_dir
RUN pip install -r requirements.txt

COPY $test_dir/tavern $project_dir/tavern
COPY $test_dir/images $project_dir/images
COPY $test_dir/scripts $project_dir/scripts
COPY $test_dir/endpoint.sh $project_dir

ENTRYPOINT ["./endpoint.sh"]
