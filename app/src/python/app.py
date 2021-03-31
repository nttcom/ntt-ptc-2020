import base64
import os
import pathlib
import subprocess
import threading

from flask import (Flask, abort, g, jsonify, make_response, request, send_file,
                   send_from_directory)

import pymysql.cursors
from utils import utility
from utils.utility import IDNotFoundError

app = Flask(__name__)
static_folder = str(pathlib.Path('public').resolve())

dbparams = {
    'host': os.getenv('MYSQL_HOST', '127.0.0.1'),
    'user': os.getenv('MYSQL_USER'),
    'password': os.getenv('MYSQL_PASSWORD'),
    'database': os.getenv('MYSQL_DATABASE'),
    'cursorclass': pymysql.cursors.DictCursor
}

app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'da4855bf92b81fafaa170ba2aa9757c4')
app.config['JSON_AS_ASCII'] = False

lock_for_file_TokenRevocationList = threading.Lock()
revocation_list_path = os.getenv('REVOCATION_LIST_PATH', 'TokenRevocationList.dat')


def dbh():
    if hasattr(g, 'db'):
        return g.db
    g.db = pymysql.connect(**dbparams)
    return g.db


@app.route('/api/login', methods=['POST'])
def login():
    if request is None:
        return jsonify({"message": "Invalid input"}), 400

    username = request.json.get('username', '')
    password = request.json.get('password', '')
    if utility.is_valid_request_string(username) is False or utility.is_valid_request_string(password) is False:
        return jsonify({"message": "Invalid input"}), 400

    conn = dbh()

    if utility.is_passwordcorrect(app, username, password, conn) is False:
        return jsonify({"message": "Invalid credentials"}), 401

    app.logger.debug("User login: " + username)

    user = utility.get_user_by_username(app, username, conn)
    user_obj = {'username': user['username'], 'role': user['role']}
    access_token = utility.create_access_token(user_obj)
    ret = {'user_id': user['id'], 'access_token': access_token}

    return jsonify(ret), 200


@app.route('/api/logout', methods=['POST'])
@utility.jwt_required
def logout(t):
    token = request.headers.get("Authorization")

    with lock_for_file_TokenRevocationList:
        with open(revocation_list_path, 'a') as f:
            f.write(token.split()[1] + '\n')

    return "", 200


@app.route('/api/users', methods=['POST'])
def signup():
    content_type = request.headers.get("Content-Type")
    if content_type is None or content_type != 'application/json':
        return jsonify({"message": "Invalid input"}), 400

    username = request.json.get('username', '')
    password = request.json.get('password', '')
    role = request.json.get('role', '')

    if utility.is_valid_request_string(username) is False or \
            utility.is_valid_request_string(password) is False:
        return jsonify({"message": "Invalid input"}), 400

    if role != "audience" and role != "artist":
        return "Invalid input\n", 400

    conn = dbh()

    user = utility.get_user_by_username(app, username, conn)

    if user is not None:
        return "The same username exists\n", 409

    try:
        with conn.cursor() as cursor:

            query = "INSERT INTO users(username, role, password_hash, salt)" + \
                    " VALUES(%s, %s, %s, %s)"

            salt = utility.get_salt()

            cursor.execute(query, (username, role, utility.get_passwordhash(salt, password), salt))

            conn.commit()

            res = {'user_id': cursor.lastrowid,
                   'username': username,
                   'role': role}

        return jsonify(res), 201

    except Exception as e:
        app.logger.exception(e)
        abort(500)


@app.route('/api/users/<user_id>', methods=['GET'])
@utility.jwt_required
def get_user(token, user_id):
    try:
        user_id = int(user_id)
    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    conn = dbh()

    user = utility.get_user_by_username(app, token['username'], conn)

    if not (user['id'] == user_id or token['role'] == 'owner'):
        return jsonify({"message": "Forbidden"}), 403

    result = utility.get_user(app, user_id, conn)

    if result is None:
        return jsonify({"message": "Not Found"}), 404

    response = {'user_id': result['id'],
                'username': result['username'],
                'role': result['role']}

    return jsonify(response), 200


@app.route('/api/users/<user_id>/reservations', methods=['GET'])
@utility.jwt_required
def get_specific_reservations_by_userid(token, user_id):
    try:
        user_id = int(user_id)
    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    conn = dbh()

    username = token["username"]
    user_obj = utility.get_user_by_username(app, username, conn)
    role = token['role']

    if role == "artist":
        return "Forbidden", 403

    if role == "audience" and user_obj['id'] != user_id:
        return "Forbidden", 403

    queryparam_limit = request.args.get('limit', 5)
    queryparam_offset = request.args.get('offset', 0)

    try:
        if queryparam_limit != 5:
            queryparam_limit = int(queryparam_limit)
            if queryparam_limit < 0:
                raise ValueError

        if queryparam_offset != 0:
            queryparam_offset = int(queryparam_offset)
            if queryparam_offset < 0:
                raise ValueError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    query = 'SELECT * FROM reservations WHERE user_id = %s LIMIT %s OFFSET %s'

    with conn.cursor() as cursor:
        cursor.execute(query, (user_id, queryparam_limit, queryparam_offset))
        reservations = cursor.fetchall()

    if len(reservations) == 0:
        return "Not Found", 404

    resp = utility.generate_reservations_response(app, reservations, conn)

    return jsonify(resp)


@app.route('/api/events', methods=['GET'])
def get_events():
    user_id = request.args.get("user_id", None)
    queryparam_limit = request.args.get('limit', 12)
    queryparam_offset = request.args.get('offset', 0)
    try:
        if queryparam_limit != 12:
            queryparam_limit = int(queryparam_limit)
            if queryparam_limit < 0:
                raise ValueError

        if queryparam_offset != 0:
            queryparam_offset = int(queryparam_offset)
            if queryparam_offset < 0:
                raise ValueError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    conn = dbh()
    query = 'SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price, created_at,' \
            ' updated_at FROM `events` WHERE DATE(NOW()) <= start_at'

    if user_id is not None:
        try:
            artist_id = int(user_id)
        except ValueError:
            return jsonify({"message": "Invalid input"}), 400
        query += ' AND user_id = ' + str(artist_id)
    query += ' LIMIT %s OFFSET %s'

    try:
        with conn.cursor() as cursor:
            cursor.execute(query, (queryparam_limit, queryparam_offset,))
            events = cursor.fetchall()

        resp = utility.generate_events_response(app, events, conn)

        return jsonify(resp), 200

    except Exception as e:
        app.logger.exception(e)
        abort(500)


@app.route('/api/events', methods=['POST'])
@utility.jwt_required
def post_events(token):

    username = token["username"]
    role = token['role']

    conn = dbh()
    user_obj = utility.get_user_by_username(app, username, conn)
    req_artist_id = user_obj['id']

    if role == "audience" or role == "owner":
        return jsonify({"message": "Forbidden"}), 403

    content_type = request.headers.get("Content-Type")
    if content_type is None or content_type != 'application/json':
        return jsonify({"message": "Invalid input"}), 400

    # request body check
    try:
        req_event_name = request.json.get('event_name', '')
        req_event_genre_id = int(request.json.get('event_genre_id', None))
        req_timeslot_ids = request.json.get('timeslot_ids', None)
        req_price = int(request.json.get('price', None))
        req_start_at = request.json.get('start_at', '')
        req_end_at = request.json.get('end_at', '')

        # timeslots_idsがリストでは無い，または空，もしくは3つ以上確認だった場合
        if not isinstance(req_timeslot_ids, list) or \
                len(req_timeslot_ids) <= 0 or \
                len(req_timeslot_ids) >= 3:
            raise ValueError

        # timeslots_idsの中身のチェック，数値比較できなければTypeError，0以下ならValueError
        for i in req_timeslot_ids:
            if i <= 0:
                raise ValueError

        # 同じタイムスロットIDが指定されている場合
        if len(req_timeslot_ids) == 2 and req_timeslot_ids[0] == req_timeslot_ids[1]:
            raise ValueError

        if req_event_genre_id <= 0:
            raise ValueError

        if req_price < 1:
            raise ValueError

        if not utility.is_valid_request_string(req_event_name) or \
                not utility.is_valid_request_string(req_start_at) or \
                not utility.is_valid_request_string(req_end_at):
            raise ValueError

        start_at = utility.convert_to_datetime(req_start_at)
        end_at = utility.convert_to_datetime(req_end_at)

        if start_at is None or end_at is None:
            raise ValueError

        if end_at < start_at:
            raise ValueError

        if utility.get_genre_by_id(app, req_event_genre_id, conn) is None:
            raise ValueError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    except TypeError:
        return jsonify({"message": "Invalid input"}), 400

    if role == "artist" and user_obj['id'] != req_artist_id:
        return jsonify({"message": "Forbidden"}), 403

    event_id = 0

    try:
        with conn.cursor() as cursor:
            conn.begin()

            # timeslotsのバリデーション
            timeslots = utility.validatetimeslot(start_at, end_at, req_timeslot_ids, cursor)

            query = "INSERT INTO events (user_id, venue_id, eventgenre_id, name, start_at, end_at," \
                    "price) " \
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)"

            cursor.execute(query, (req_artist_id, timeslots[0]['venue_id'], req_event_genre_id, req_event_name, start_at,
                                   end_at, req_price))

            if cursor.rowcount != 1:
                raise Exception

            event_id = cursor.lastrowid

            for req_timeslot_id in req_timeslot_ids:
                query = "UPDATE timeslots SET event_id=%s WHERE id=%s AND event_id is NULL"
                cursor.execute(query, (event_id, req_timeslot_id))

                if cursor.rowcount != 1:
                    raise utility.DuplicatedError

            conn.commit()

    except ValueError:
        conn.rollback()
        return jsonify({"message": "Invalid input"}), 400

    except utility.ForbiddenError:
        conn.rollback()
        return jsonify({"message": "Forbidden"}), 403

    except utility.DuplicatedError:
        return jsonify({"message": "Duplicated"}), 409

    except Exception as e:
        conn.rollback()
        app.logger.exception(e)
        abort(500)

    event = utility.get_event_by_id(app, event_id, conn)
    event_detail = utility.generate_events_response(app, [event], conn)[0]

    return jsonify(event_detail), 201


@app.route('/api/events/<event_id>', methods=['GET'])
def get_events_specific(event_id):
    try:
        event_id = int(event_id)

        if not utility.is_valid_request_id(event_id):
            raise IDNotFoundError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    except IDNotFoundError:
        return jsonify({"message": "Not Found"}), 404

    conn = dbh()

    event = utility.get_event_by_id(app, event_id, conn)
    app.logger.info(event)

    # 当該event_idが存在しない場合
    if event is None:
        return jsonify({"message": "Not Found"}), 404

    event_detail = utility.generate_events_response(app, [event], conn)[0]

    return jsonify(event_detail), 200


@app.route('/api/events/<event_id>', methods=['PUT'])
@utility.jwt_required
def update_events(token, event_id):
    username = token["username"]
    role = token["role"]

    conn = dbh()
    user_obj = utility.get_user_by_username(app, username, conn)

    content_type = request.headers.get("Content-Type")
    if content_type is None or content_type != 'application/json':
        return jsonify({"message": "Invalid input"}), 400

    # request body check
    try:
        req_event_name = request.json.get('event_name', '')
        req_event_genre_id = int(request.json.get('event_genre_id', None))
        req_timeslot_ids = request.json.get('timeslot_ids', None)
        req_price = int(request.json.get('price', None))
        req_start_at = request.json.get('start_at', '')
        req_end_at = request.json.get('end_at', '')
        req_artist_id = user_obj['id']
        req_event_id = int(event_id)

        # timeslots_idsがリストでは無い，または空，もしくは3つ以上だった場合
        if not isinstance(req_timeslot_ids, list) or \
                len(req_timeslot_ids) <= 0 or \
                len(req_timeslot_ids) >= 3:
            raise ValueError

        # timeslots_idsの中身のチェック，数値比較できなければTypeError，0以下ならValueError
        for i in req_timeslot_ids:
            if i <= 0:
                raise ValueError

        # 同じタイムスロットIDが指定されている場合
        if len(req_timeslot_ids) == 2 and req_timeslot_ids[0] == req_timeslot_ids[1]:
            raise ValueError

        if req_event_genre_id <= 0 or \
                req_artist_id <= 0:
            raise ValueError

        if req_event_id <= 0:
            raise IDNotFoundError

        if req_price < 1:
            raise ValueError

        if not utility.is_valid_request_string(req_event_name) or \
                not utility.is_valid_request_string(req_start_at) or \
                not utility.is_valid_request_string(req_end_at):
            raise ValueError

        start_at = utility.convert_to_datetime(req_start_at)
        end_at = utility.convert_to_datetime(req_end_at)

        if start_at is None or end_at is None:
            raise ValueError

        if end_at < start_at:
            raise ValueError

        if utility.get_genre_by_id(app, req_event_genre_id, conn) is None:
            raise ValueError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    except TypeError:
        return jsonify({"message": "Invalid input"}), 400

    except IDNotFoundError:
        return jsonify({"message": "Not Found"}), 404

    event = utility.get_event_by_id(app, req_event_id, conn)
    if event is None:
        return jsonify({"message": "Not Found"}), 404

    if role == "audience":
        return jsonify({"message": "Forbidden"}), 403
    elif role == "artist":
        if user_obj['id'] != event['user_id']:
            return jsonify({"message": "Forbidden"}), 403

    try:
        with conn.cursor() as cursor:

            conn.begin()

            # timeslotsのバリデーション
            timeslots = utility.validatetimeslot(start_at, end_at, req_timeslot_ids, cursor)

            # update event
            query = "UPDATE events SET eventgenre_id=%s, name=%s,venue_id=%s, start_at=%s, end_at=%s, price=%s" \
                    " WHERE id=%s"
            cursor.execute(query, (req_event_genre_id, req_event_name, timeslots[0]['venue_id'], start_at, end_at,
                                   req_price, req_event_id,))

            # clear old timeslot
            query = "UPDATE timeslots SET event_id=NULL WHERE event_id=%s"
            cursor.execute(query, (req_event_id,))

            if cursor.rowcount != 1 and cursor.rowcount != 2:
                raise Exception

            # update new timeslot
            for req_timeslot_id in req_timeslot_ids:
                query = "UPDATE timeslots SET event_id=%s WHERE id=%s AND event_id is NULL"
                cursor.execute(query, (req_event_id, req_timeslot_id, ))

                if cursor.rowcount != 1:
                    raise utility.DuplicatedError

            conn.commit()

    except ValueError:
        conn.rollback()
        return jsonify({"message": "Invalid input"}), 400

    except utility.ForbiddenError:
        conn.rollback()
        return jsonify({"message": "Forbidden"}), 403

    except utility.DuplicatedError:
        conn.rollback()
        return jsonify({"message": "Duplicated"}), 409

    except Exception as e:
        conn.rollback()
        app.logger.exception(e)
        abort(500)

    event = utility.get_event_by_id(app, event_id, conn)
    event_detail = utility.generate_events_response(app, [event], conn)[0]

    return jsonify(event_detail), 200


@app.route('/api/events/<event_id>/image', methods=['GET'])
def get_images(event_id):
    try:
        event_id = int(event_id)
    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    conn = dbh()

    with conn.cursor() as cursor:
        query = 'SELECT image FROM events WHERE id = %s'
        cursor.execute(query, (event_id,))

        event = cursor.fetchone()

        if event is None:
            return jsonify({"message": "Not Found"}), 404
        elif event['image'] is None:
            return send_file(str(static_folder) + '/img/default.png', mimetype='image/png')

        icon = base64.b64decode(event['image'])
        response = make_response(icon)
        response.headers.set('Content-Type', 'image/png')
    return response


@app.route('/api/events/<event_id>/image', methods=['PUT'])
@utility.jwt_required
def put_images(token, event_id):

    content_types = (request.headers.get("Content-Type")).split(';')
    if content_types is None or content_types[0] != 'multipart/form-data':
        return jsonify({"message": "Invalid input"}), 400

    conn = dbh()

    role = token['role']
    login_user = utility.get_user_by_username(app, token['username'], conn)

    try:
        event_id = int(event_id)
        file = request.files['image']
    except ValueError:
        return jsonify({"message": "Invalid input"}), 400
    except KeyError:
        return jsonify({"message": "Invalid input"}), 400

    if role == "audience":
        return jsonify({"message": "Forbiddon"}), 403

    if request.files['image'].content_type != 'image/png':
        return jsonify({"message": "Invalid input"}), 400

    image_string = base64.b64encode(file.read())

    with conn.cursor() as cursor:
        query = 'SELECT * FROM events WHERE id = %s'
        cursor.execute(query, (event_id,))

        event = cursor.fetchone()

        if event is None:
            return jsonify({"message": "Not found"}), 404
        elif event['user_id'] != login_user['id'] and token['role'] != "owner":
            return jsonify({"message": "Forbidden"}), 403

        query = "UPDATE events SET image=%s WHERE id=%s"
        cursor.execute(query, (image_string, event_id))

        conn.commit()
        return "", 204


@app.route('/api/events/<event_id>/reservations', methods=['GET'])
@utility.jwt_required
def get_reservations(token, event_id):

    # query param check
    queryparam_limit = request.args.get('limit', 10)
    queryparam_offset = request.args.get('offset', 0)
    try:
        if queryparam_limit != 10:
            queryparam_limit = int(queryparam_limit)
            if queryparam_limit < 0:
                raise ValueError

        if queryparam_offset != 0:
            queryparam_offset = int(queryparam_offset)
            if queryparam_offset < 0:
                raise ValueError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    if token['role'] == 'audience':
        return jsonify({"message": "Forbidden"}), 403

    # path param check
    try:
        event_id = int(event_id)
        if not utility.is_valid_request_id(event_id):
            return jsonify({"message": "Not Found"}), 404
    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    conn = dbh()

    event = utility.get_event_by_id(app, event_id, conn)
    if event is None:
        return jsonify({"message": "Not Found"}), 404

    login_user = utility.get_user_by_username(app, token['username'], conn)

    if token['role'] == "audience":
        return jsonify({"message": "Forbidden"}), 403

    if token['role'] == 'artist':
        if event['user_id'] != login_user['id']:
            return jsonify({"message": "Forbidden"}), 403

    reservations = utility.get_reservations_by_eventid(
        app, event_id, conn, queryparam_offset, queryparam_limit)

    if reservations is None or len(reservations) == 0:
        return jsonify(list()), 200

    resp = utility.generate_reservations_response(app, reservations, conn)

    return jsonify(resp), 200


@app.route('/api/reservations/<resv_id>', methods=['GET'])
@utility.jwt_required
def get_specific_reservations_by_eventid_and_resvid(token, resv_id):
    username = token["username"]
    role = token["role"]

    conn = dbh()
    user_obj = utility.get_user_by_username(app, username, conn)

    # check 400 error
    try:
        resv_id = int(resv_id)

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    if role == "artist":
        return jsonify({"message": "Forbidden"}), 403

    reservation = utility.get_reservation_by_id(app, resv_id, conn)

    if reservation is None:
        return jsonify({"message": "Not Found"}), 404

    if role == "audience" and reservation['user_id'] != user_obj['id']:
        return jsonify({"message": "Forbidden"}), 403

    resp = utility.generate_reservations_response(app, [reservation], conn)[0]

    return jsonify(resp)


@app.route('/api/reservations/<reservation_id>', methods=['DELETE'])
@utility.jwt_required
def delete_resv(token, reservation_id):
    username = token["username"]

    conn = dbh()
    user_obj = utility.get_user_by_username(app, username, conn)

    role = token["role"]
    user_id = user_obj["id"]

    # check 400 error
    try:
        reservation_id = int(reservation_id)

        reservation = utility.get_reservation_by_id(app, reservation_id, conn)
        if reservation is None:
            raise IDNotFoundError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    except IDNotFoundError:
        return jsonify({"message": "Not Found"}), 404

    if role == "artist":
        return jsonify({"message": "Forbidden"}), 403

    if role == "audience" and reservation['user_id'] != user_id:
        return jsonify({"message": "Forbidden"}), 403

    try:
        with conn.cursor() as cursor:

            query = "DELETE FROM reservations WHERE id=%s"

            cursor.execute(query, reservation_id)

            conn.commit()

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    return "", 204


@app.route('/api/events/<event_id>/reservations', methods=['POST'])
@utility.jwt_required
def post_reservation(token, event_id):
    app.logger.debug(request.json)
    if request is None:
        return jsonify({"message": "Invalid input"}), 400

    content_type = request.headers.get("Content-Type")
    if content_type is None or content_type != 'application/json':
        return jsonify({"message": "Invalid input"}), 400

    username = token["username"]
    role = token['role']

    conn = dbh()
    user_obj = utility.get_user_by_username(app, username, conn)

    # request body check
    try:
        req_user_id = user_obj['id']
        req_event_id = int(event_id)
        req_num_of_resv = int(request.json.get('num_of_resv', None))

        if req_event_id <= 0:
            raise IDNotFoundError

        if utility.is_valid_request_id(req_user_id) is False:
            raise ValueError

        if req_num_of_resv < 1:
            raise ValueError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    except TypeError:
        return jsonify({"message": "Invalid input"}), 400

    except IDNotFoundError:
        return jsonify({"message": "Not Found"}), 404

    if role != "audience":
        return jsonify({"message": "Forbidden"}), 403

    if req_user_id != user_obj['id']:
        return jsonify({"message": "Forbidden"}), 403

    event = utility.get_event_by_id(app, req_event_id, conn)
    if event is None:
        return jsonify({"message": "Not Found"}), 404

    venue = utility.get_venue_by_id(app, event['venue_id'], conn)

    new_resv_id = 0
    try:
        with conn.cursor() as cursor:

            conn.begin()

            query = 'LOCK TABLE reservations WRITE'
            cursor.execute(query,)

            # if user has already reserved
            query = 'SELECT * FROM reservations WHERE event_id = %s and user_id = %s'
            cursor.execute(query, (req_event_id, user_obj['id'],))

            if cursor.rowcount >= 1:
                return jsonify({"message": "User has already reserved"}), 409

            # get current resv
            query = 'SELECT * FROM reservations WHERE event_id = %s'
            cursor.execute(query, (req_event_id,))

            results = cursor.fetchall()

            curret_resv = 0

            for result in results:
                curret_resv += result['num_of_resv']

            # Will the capacity be exceeded by this booking?
            if req_num_of_resv + curret_resv > venue['capacity']:
                return jsonify({"message": "Sold out the ticket"}), 409

            query = "INSERT INTO reservations(user_id, event_id, num_of_resv)" + \
                    " VALUES(%s, %s, %s)"

            cursor.execute(query, (req_user_id, req_event_id, req_num_of_resv,))

            if cursor.rowcount != 1:
                query = 'UNLOCK TABLES'
                cursor.execute(query, )
                raise Exception

            new_resv_id = cursor.lastrowid

            conn.commit()
            query = 'UNLOCK TABLES'
            cursor.execute(query, )

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    reservation = utility.get_reservation_by_id(app, new_resv_id, conn)
    resp = utility.generate_reservations_response(app, [reservation], conn)[0]

    return jsonify(resp), 201


@app.route('/api/genres', methods=['GET'])
@utility.jwt_required
def get_genres(token):
    role = token['role']

    if role == "audience":
        return jsonify({"message": "Forbidden"}), 403

    conn = dbh()

    results = utility.get_genres(app, conn)
    return jsonify(results), 200


@app.route('/api/venues', methods=['GET'])
@utility.jwt_required
def get_venues(token):
    # query param check
    queryparam_limit = request.args.get('limit', 5)
    queryparam_offset = request.args.get('offset', 0)
    try:
        if queryparam_limit != 5:
            queryparam_limit = int(queryparam_limit)
            if queryparam_limit < 0:
                raise ValueError

        if queryparam_offset != 0:
            queryparam_offset = int(queryparam_offset)
            if queryparam_offset < 0:
                raise ValueError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    conn = dbh()

    records = utility.get_venues(app, conn, queryparam_offset, queryparam_limit)
    return jsonify(records), 200


@app.route('/api/venues/<venue_id>/timeslots', methods=['GET'])
@utility.jwt_required
def get_venue_timeslots(token, venue_id):
    # query param check
    queryparam_from = request.args.get('from', None)
    queryparam_to = request.args.get('to', None)
    try:
        if queryparam_from is not None:
            queryparam_from = utility.convert_to_datetime(queryparam_from)
            if queryparam_from is None:
                raise ValueError

        if queryparam_to is not None:
            queryparam_to = utility.convert_to_datetime(queryparam_to)
            if queryparam_to is None:
                raise ValueError

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    try:
        venue_id = int(venue_id)

        conn = dbh()

        venue = utility.get_venue_by_id(app, venue_id, conn)
        if venue is None:
            return jsonify({"message": "Not Found"}), 404

        role = token['role']

        if role == "audience":
            return jsonify({"message": "Forbidden"}), 403

    except ValueError:
        return jsonify({"message": "Invalid input"}), 400

    records = utility.get_venue_timeslots(app, venue_id, conn, queryparam_from, queryparam_to)

    # Does the venue exists?
    if records is None or len(records) == 0:
        records = []

    return jsonify(records)


@app.after_request
def after_request_func(response):
    if hasattr(g, 'db'):
        dbh().close()
    return response


@app.route('/')
def root():
    return send_file(str(static_folder) + "/index.html")


@app.route('/<path:path>')
def send_js(path):
    return send_from_directory(str(static_folder), path)


@app.route('/api/initialize', methods=['POST'])
def initialize():
    res = subprocess.call(['bash', 'scripts/init.sh'])
    if res != 0:
        abort(500)

    # 販促実施に応じて，ここの値を変更してください
    # 詳しくは，specを参照してください．
    # https://portal.ptc.ntt.dev/spec.html#tag/other
    return "1", 200


if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0')
