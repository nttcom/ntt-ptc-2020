import hashlib
from datetime import datetime as dt, timedelta
import secrets
from functools import wraps

import flask
import jwt
import pymysql
from flask import abort

secret = 'da4855bf92b81fafaa170ba2aa9757c4'


def create_access_token(userobject):
    payload = {"iat": get_unixtime(), "exp": get_unixtime(3600), "identity": userobject["username"],
               "user_claims": {"role": userobject["role"]}}

    token = jwt.encode(payload, secret, algorithm='HS256').decode('utf-8')
    return token


def jwt_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        request = flask.request

        if request is None:
            return "Invalid input\n", 400

        auth_header = request.headers.get("Authorization")
        if auth_header is None or len(auth_header.split()) != 2:
            # TODO: Authorization Headerに値がない場合のエラーコードを言語で統一する
            return "Invalid input\n", 401

        jwt_token = auth_header.split()[1]

        if jwt_token is None or jwt_token == "":
            return "Invalid credentials\n", 401

        try:
            token = jwt.decode(jwt_token, secret, algorithms=['HS256'])
        except jwt.exceptions.ExpiredSignatureError:
            return "Invalid credentials\n", 401

        if is_revoked(request):
            return "Invalid credentials\n", 401

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


def is_passwordcorrect(app, username, password, dbparams):
    result = get_user_by_username(app, username, dbparams)

    if result is None:
        return False

    return get_passwordhash(result['salt'], password) == result['password_hash']


def get_user_by_username(app, username, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM users WHERE username = %s'
            cursor.execute(query, (username,))
            app.logger.debug(cursor._last_executed)
            result = cursor.fetchone()

            if result is None:
                return None

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def get_user(app, user_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM users WHERE id = %s'
            cursor.execute(query, (user_id,))
            app.logger.debug(cursor._last_executed)
            result = cursor.fetchone()

            if result is None:
                return None

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def is_revoked(request):
    with open('TokenRevocationList.dat', 'r') as f:
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


def is_valid_request_role(d):
    if is_valid_request_string(d) is False:
        return False

    if d not in ['audience', 'artist']:
        return False

    return True


def get_unixtime(delta=0):
    now = dt.today() + timedelta(seconds=delta)
    timestamp_f = now.timestamp()
    timestamp_str = str(timestamp_f)
    # return timestamp without milliseconds
    return timestamp_str.split(".")[0]


def convert_to_iso8601(d):
    return dt.isoformat(d)


def convert_to_boolean(n):
    if isinstance(n, int):
        return True if n == 1 else False
    elif isinstance(n, str):
        if n == "true":
            return True
        elif n == "false":
            return False
        else:
            return None
    else:
        return None


def get_event_record_by_id(app, event_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM events WHERE id = %s'
            cursor.execute(query, (event_id,))
            app.logger.debug(cursor._last_executed)
            result = cursor.fetchone()

            if result is None:
                return None

            result['is_public'] = convert_to_boolean(result['is_public'])

            # get venue_capaciry
            venue = get_venues_record_by_id(app, result['venue_id'], dbparams)
            result['capacity'] = venue['capacity']

            # get current_resv
            result['current_resv'] = get_current_resv(app, result['id'], dbparams)

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def generate_events_response(app, events, dbparams):
    response = []
    for event in events:
        event['created_at'] = convert_to_iso8601(event['created_at'])
        event['updated_at'] = convert_to_iso8601(event['updated_at'])
        event['start_at'] = convert_to_iso8601(event['start_at'])
        event['end_at'] = convert_to_iso8601(event['end_at'])
        event['artist_id'] = event.pop('user_id')
        event['event_name'] = event.pop('name')
        event['event_genre_id'] = event.pop('eventgenre_id')

        event.pop('is_public')
        event.pop('event_status')
        event.pop('expose_at')

        # get artist name
        event['artist_name'] = get_user(app, event['artist_id'], dbparams)['username']

        # get venue_name
        venue = get_venues_record_by_id(app, event['venue_id'], dbparams)
        event['venue_name'] = venue['name']

        # get capaciry
        event['capacity'] = venue['capacity']

        # get current_resv
        event['current_resv'] = get_current_resv(app, event['id'], dbparams)

        response.append(event)

    return response


def get_events_records(app, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM events WHERE is_public is TRUE'
            cursor.execute(query,)
            app.logger.debug(cursor._last_executed)
            results = cursor.fetchall()

            records = generate_events_response(app, results, dbparams)

            return records

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_events_records_by_user_id(app, user_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM events WHERE is_public is TRUE and user_id = %s'
            cursor.execute(query, (user_id))
            app.logger.debug(cursor._last_executed)
            results = cursor.fetchall()

            records = generate_events_response(app, results, dbparams)

            return records

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_venues_record_by_id(app, venue_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM venues WHERE id = %s'
            cursor.execute(query, (venue_id,))
            app.logger.debug(cursor._last_executed)
            result = cursor.fetchone()

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def get_venue_timeslots_by_event_id(app, event_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM timeslots WHERE event_id = %s'
            cursor.execute(query, (event_id,))
            app.logger.debug(cursor._last_executed)
            results = cursor.fetchall()

        return results

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def get_current_resv(app, event_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM reservations WHERE event_id = %s'
            cursor.execute(query, (event_id,))
            app.logger.debug(cursor._last_executed)
            results = cursor.fetchall()

            curret_resv = 0

            for result in results:
                curret_resv += result['num_of_resv']

            return curret_resv

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def get_reservations_records(app, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM reservations'
            cursor.execute(query, ())
            app.logger.debug(cursor._last_executed)
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

    finally:
        conn.close()


def get_reservations_record_by_id(app, resv_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM reservations WHERE id = %s'
            cursor.execute(query, (resv_id,))
            app.logger.debug(cursor._last_executed)
            result = cursor.fetchone()

            if result is None:
                return None

            result['created_at'] = convert_to_iso8601(result['created_at'])
            result['updated_at'] = convert_to_iso8601(result['updated_at'])

        return result

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def get_reservations_records_by_userid(app, user_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM reservations WHERE user_id = %s'
            cursor.execute(query, (user_id,))
            app.logger.debug(cursor._last_executed)
            results = cursor.fetchall()

            records = []
            for result in results:
                result['created_at'] = convert_to_iso8601(result['created_at'])
                result['updated_at'] = convert_to_iso8601(result['updated_at'])
                records.append(result)

        return records

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def get_venues_records(app, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM venues'
            cursor.execute(query)
            app.logger.debug(cursor._last_executed)
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

    finally:
        conn.close()


def get_venue_timeslots(app, venue_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM timeslots WHERE venue_id = %s AND event_id IS NULL'
            cursor.execute(query, (venue_id,))
            app.logger.debug(cursor._last_executed)
            results = cursor.fetchall()

            if results is None:
                return None

            records = []
            for result in results:
                result['created_at'] = convert_to_iso8601(result['created_at'])
                result['updated_at'] = convert_to_iso8601(result['updated_at'])
                result.pop('event_id')
                records.append(result)

        return records

    except Exception as e:
        app.logger.exception(e)
        abort(500)

    finally:
        conn.close()


def get_genres(app, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM eventgenres'
            cursor.execute(query, )
            app.logger.debug(cursor._last_executed)
            results = cursor.fetchall()

        return results

    except Exception as e:
        app.logger.exception(e)
        abort(500)


def get_reservations_records_by_eventid(app, event_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM reservations WHERE event_id = %s'
            cursor.execute(query, (event_id,))
            app.logger.debug(cursor._last_executed)
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

    finally:
        conn.close()


def get_reservations_records_by_userid_and_eventid(app, user_id, event_id, dbparams):
    conn = pymysql.connect(**dbparams)

    try:
        with conn.cursor() as cursor:
            query = 'SELECT * FROM reservations WHERE user_id = %s and event_id = %s'
            cursor.execute(query, (user_id, event_id,))
            app.logger.debug(cursor._last_executed)
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

    finally:
        conn.close()