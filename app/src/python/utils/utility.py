import calendar
import hashlib
import os
import secrets
from datetime import datetime as dt
from datetime import timedelta
from functools import wraps

import flask
from flask import abort, jsonify

import iso8601
import jwt

secret = os.getenv('JWT_SECRET_KEY', 'da4855bf92b81fafaa170ba2aa9757c4')
revocation_list_path = os.getenv('REVOCATION_LIST_PATH', 'TokenRevocationList.dat')


class IDNotFoundError(Exception):
    """IDが見つからなかった無かったことを知らせるクラス"""
    pass


class ForbiddenError(Exception):
    """権限がなかったことを知らせるクラス"""
    pass


class DuplicatedError(Exception):
    """重複を知らせるクラス"""
    pass


def create_access_token(userobject):
    payload = {"iat": get_unixtime(), "exp": get_unixtime(3600), "username": userobject["username"],
               "role": userobject["role"]}

    token = jwt.encode(payload, secret, algorithm='HS256').decode('utf-8')
    return token


def jwt_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        request = flask.request

        if request is None:
            return jsonify({"message": "Invalid input"}), 400

        auth_header = request.headers.get("Authorization")
        if auth_header is None or len(auth_header.split()) != 2:
            return jsonify({"message": "Invalid credentials"}), 401

        jwt_token = auth_header.split()[1]

        if jwt_token is None or jwt_token == "":
            return jsonify({"message": "Invalid credentials"}), 401

        try:
            token = jwt.decode(jwt_token, secret, algorithms=['HS256'])
        except jwt.exceptions.ExpiredSignatureError:
            return jsonify({"message": "Invalid credentials"}), 401
        except jwt.InvalidSignatureError:
            return jsonify({"message": "Invalid credentials"}), 401

        if is_revoked(request):
            return jsonify({"message": "Invalid credentials"}), 401

        else:
            return fn(token, *args, **kwargs)

    return wrapper


def get_salt():
    return secrets.token_hex(64)


def get_passwordhash(salt, password):
    string = password + salt
    for _ in range(100):
        string = hashlib.sha3_512(string.encode("UTF-8")).hexdigest()
    return string


def is_passwordcorrect(app, username, password, conn):
    result = get_user_by_username(app, username, conn)

    if result is None:
        return False

    return get_passwordhash(result['salt'], password) == result['password_hash']


def get_last_date(dt):
    return dt.replace(day=calendar.monthrange(dt.year, dt.month)[1],
                      hour=23, minute=59, second=59, microsecond=0)


def is_revoked(request):
    if not os.path.isfile(revocation_list_path):
        return False

    with open(revocation_list_path, 'r') as f:
        token = request.headers.get("Authorization")
        line = f.readline().rstrip('\n')
        while line:
            if token.split()[1] == line:
                return True
            line = f.readline().rstrip('\n')

        return False


def is_valid_request_id(d):
    return d >= 0


def is_valid_request_string(d):
    if (not isinstance(d, str)) or d == '':
        return False

    return True


def is_same_date(dt1, dt2):
    return dt1.year == dt2.year and dt1.month == dt2.month and dt1.day == dt2.day


def get_unixtime(delta=0):
    now = dt.today() + timedelta(seconds=delta)
    timestamp_f = now.timestamp()
    timestamp_str = str(timestamp_f)
    # return timestamp without milliseconds
    return int(timestamp_str.split(".")[0])


def convert_to_iso8601(d):
    try:
        return dt.isoformat(d) + 'Z'
    except Exception:
        return d


def convert_to_datetime(time):
    try:
        res = iso8601.parse_date(time)
    except Exception:
        return None

    # 例: +09:00(JST) を 0:00(UTC) に変換
    if '+' in time:
        return (res - res.utcoffset()).replace(tzinfo=None)
    # 例: -09:00 を 0:00(UTC) に変換
    elif '-' in time:
        return (res + res.utcoffset()).replace(tzinfo=None)
    else:
        return res.utcoffset().replace(tzinfo=None)


def generate_reservations_response(app, reservations, conn):
    response = []
    for reservation in reservations:
        reservation['username'] = get_user(app, reservation['user_id'], conn)['username']
        event = get_event_by_id(app, reservation['event_id'], conn)
        reservation['event_name'] = event['name']
        reservation['event_start_at'] = event['start_at']
        reservation['event_end_at'] = event['end_at']
        reservation['event_price'] = event['price']
        reservation['venue_name'] = get_venue_by_id(app,
                                                    event['venue_id'],
                                                    conn)['name']
        reservation['created_at'] = convert_to_iso8601(reservation['created_at'])
        reservation['updated_at'] = convert_to_iso8601(reservation['updated_at'])

        response.append(reservation)

    return response


def generate_events_response(app, events, conn):
    response = []
    for event in events:
        event['created_at'] = convert_to_iso8601(event['created_at'])
        event['updated_at'] = convert_to_iso8601(event['updated_at'])
        event['start_at'] = convert_to_iso8601(event['start_at'])
        event['end_at'] = convert_to_iso8601(event['end_at'])
        event['artist_id'] = event.pop('user_id')
        event['event_name'] = event.pop('name')
        event['event_genre_id'] = event.pop('eventgenre_id')

        # get artist name
        event['artist_name'] = get_user(app, event['artist_id'], conn)['username']

        # get venue_name
        venue = get_venue_by_id(app, event['venue_id'], conn)
        event['venue_name'] = venue['name']

        # get capaciry
        event['capacity'] = venue['capacity']

        # get current_resv
        event['current_resv'] = get_current_resv(app, event['id'], conn)

        # get timeslots
        event['timeslot_ids'] = get_timeslots_records_id_by_eventid(app, event['id'], conn)

        response.append(event)

    return response


def get_user_by_username(app, username, conn):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM users WHERE username = %s'
            cursor.execute(query, (username,))

            result = cursor.fetchone()

            if result is None:
                return None

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_user(app, user_id, conn):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM users WHERE id = %s'
            cursor.execute(query, (user_id,))

            result = cursor.fetchone()

            if result is None:
                return None

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_genres(app, conn):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM eventgenres'
            cursor.execute(query, )

            results = cursor.fetchall()

        return results

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_genre_by_id(app, genre_id, conn):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM eventgenres WHERE id = %s'
            cursor.execute(query, (genre_id,))

            result = cursor.fetchone()

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_event_by_id(app, event_id, conn):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price,' \
                    ' created_at, updated_at FROM events WHERE id= %s'
            cursor.execute(query, (event_id,))

            event = cursor.fetchone()

            if event is None:
                return None

            event['created_at'] = convert_to_iso8601(event['created_at'])
            event['updated_at'] = convert_to_iso8601(event['updated_at'])
            event['start_at'] = convert_to_iso8601(event['start_at'])
            event['end_at'] = convert_to_iso8601(event['end_at'])

            return event

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_reservation_by_id(app, resv_id, conn):
    try:
        with conn.cursor() as cursor:

            query = 'SELECT * FROM reservations WHERE id = %s'
            cursor.execute(query, (resv_id,))

            result = cursor.fetchone()

            if result is None:
                return None

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_reservations_by_eventid(app, event_id, conn, offset, limit):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM reservations WHERE event_id = %s LIMIT %s OFFSET %s'
            cursor.execute(query, (event_id, limit, offset,))

            reservations = cursor.fetchall()

            if reservations is None:
                return None

        return reservations

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_current_resv(app, event_id, conn):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM reservations WHERE event_id = %s'
            cursor.execute(query, (event_id,))

            results = cursor.fetchall()

            curret_resv = 0

            for result in results:
                curret_resv += result['num_of_resv']

            return curret_resv

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_timeslots_records_id_by_eventid(app, eventid, conn):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM timeslots WHERE event_id = %s'
            cursor.execute(query, (eventid,))

            results = cursor.fetchall()

            ids = list()
            for i in results:
                ids.append(i['id'])

        return ids

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_venues(app, conn, offset, limit):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM venues LIMIT %s OFFSET %s'
            cursor.execute(query, (limit, offset,))

            results = cursor.fetchall()

            if results is None:
                return None

            records = []
            for result in results:
                result['created_at'] = convert_to_iso8601(result['created_at'])
                result['updated_at'] = convert_to_iso8601(result['updated_at'])
                records.append(result)

        return records

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_venue_by_id(app, venue_id, conn):
    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM venues WHERE id = %s'
            cursor.execute(query, (venue_id,))

            result = cursor.fetchone()

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_venue_timeslots(app, venue_id, conn, from_=None, to=None):
    try:
        if from_ is None:
            from_ = dt.now()
        if to is None:
            to = get_last_date(dt.now())

        with conn.cursor() as cursor:
            query = 'SELECT * FROM timeslots WHERE venue_id = %s AND event_id IS NULL AND ' \
                    '%s <= start_at AND start_at <= %s'
            cursor.execute(query, (venue_id, from_, to,))

            results = cursor.fetchall()

            if results is None:
                return None

            records = []
            for result in results:
                result['start_at'] = convert_to_iso8601(result['start_at'])
                result['end_at'] = convert_to_iso8601(result['end_at'])
                result['created_at'] = convert_to_iso8601(result['created_at'])
                result['updated_at'] = convert_to_iso8601(result['updated_at'])
                result.pop('event_id')
                result.pop('venue_id')
                records.append(result)

        return records

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def validatetimeslot(start_at, end_at, req_timeslot_ids, cursor):
    # timeslots_idsで指定されたタイムスロット全ての開始/終了時刻を取得
    timeslots_begins = list()
    timeslots_ends = list()
    timeslots_venues = list()
    timeslots = list()
    for req_timeslot_id in req_timeslot_ids:

        query = 'SELECT * FROM timeslots WHERE id = %s FOR UPDATE'
        cursor.execute(query, (req_timeslot_id,))

        timeslot = cursor.fetchone()

        if timeslot is None:
            raise ValueError

        timeslot_begin = timeslot['start_at']
        timeslot_end = timeslot['end_at']

        timeslots_venues.append(timeslot['venue_id'])
        timeslots_begins.append(timeslot_begin)
        timeslots_ends.append(timeslot_end)
        timeslots.append(timeslot)

    # タイムスロットリストを時間で昇順になるように並び替え
    if timeslots_begins[0] > timeslots_begins[-1]:
        timeslots_begins.reverse()
        timeslots_ends.reverse()

    # タイムスロットの日付が同じであるか確認
    if not is_same_date(timeslots_begins[0], timeslots_ends[-1]):
        raise ValueError

    # タイムスロット枠内に収まっているか確認
    if start_at < timeslots_begins[0] or timeslots_ends[-1] < end_at or \
            end_at < timeslots_begins[0] or timeslots_ends[-1] < start_at:
        raise ValueError

    # venue_idが同じであるか確認
    if timeslots_venues[0] != timeslots_venues[-1]:
        raise ValueError

    return timeslots
