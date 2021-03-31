import typing
from random import randrange

import mimesis
import pymysql.cursors
import os

from utils import utility

dbparams = {
    'host': os.getenv('MYSQL_HOST', '127.0.0.1'),
    'user': os.getenv('MYSQL_USER'),
    'password': os.getenv('MYSQL_PASSWORD'),
    'database': os.getenv('MYSQL_DATABASE'),
    'cursorclass': pymysql.cursors.DictCursor
}

conn = pymysql.connect(**dbparams)

g = mimesis.Generic('ja')


def random_date(start, end):
    """
    This function will return a random datetime between two datetime
    objects.
    """
    if start < end:
        delta = end - start
        int_delta = (delta.days * 24 * 60 * 60) + delta.seconds
        random_second = randrange(int_delta)
        return start + timedelta(seconds=random_second)
    else:
        return start # start_at < created_at の対応


#### generate users ####

# try:
#     with conn.cursor() as cursor:
#         # audience
#         for i in range(9000):
#             person = g.person
#             name = person.last_name()
#             name += person.first_name()
#
#             query = "INSERT INTO users(username, role, password_hash, salt)" + \
#                     " VALUES(%s, %s, %s, %s)"
#
#             salt = utility.get_salt()
#             cursor.execute(query, (name, "audience", utility.get_passwordhash(salt, "password"), salt))
#
#             print(cursor._last_executed)
#
#         # artist
#         for i in range(990):
#             person = g.person
#             name = person.last_name()
#             name += person.first_name()
#
#             query = "INSERT INTO users(username, role, password_hash, salt)" + \
#                     " VALUES(%s, %s, %s, %s)"
#
#             salt = utility.get_salt()
#             cursor.execute(query, (name, "artist", utility.get_passwordhash(salt, "password"), salt))
#
#             print(cursor._last_executed)
#
#         # owner
#         for i in range(10):
#             person = g.person
#             name = person.last_name()
#             name += person.first_name()
#
#             query = "INSERT INTO users(username, role, password_hash, salt)" + \
#                     " VALUES(%s, %s, %s, %s)"
#
#             salt = utility.get_salt()
#             cursor.execute(query, (name, "owner", utility.get_passwordhash(salt, "password"), salt))
#
#             print(cursor._last_executed)
#
#         conn.commit()
#
#
# finally:
#     conn.close()


#### generate venues ####

from datetime import datetime, timedelta

#
# try:
#     with conn.cursor() as cursor:
#         # audience
#         for i in range(300):
#
#             # query = "INSERT INTO venues(name, capacity)" + \
#             #         " VALUES(%s, %s)"
#
#             time = random_date(d1, d2)
#
#             query = "UPDATE venues SET created_at=%s, updated_at=%s WHERE id=%s"
#
#             salt = utility.get_salt()
#             cursor.execute(query, (time, time, i+1))
#
#             print(cursor._last_executed)
#             conn.commit()
#
# finally:
#     conn.close()


##### generate timeslots #####
# source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_users_t.sql; source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_venues_t.sql; source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_eventgenres_t.sql;
#
# import random
#
# d1 = datetime.strptime('2019/01/01', '%Y/%m/%d')
# d2 = datetime.strptime('2019/06/01', '%Y/%m/%d')
# try:
#     with conn.cursor() as cursor:
#         company_name = g.business.company()
#
#         query = "SELECT COUNT(id) AS cnt FROM venues"
#         cursor.execute(query)
#         result = cursor.fetchone()
#
#         venue_size = result['cnt']
#
#         for venue_id in range(venue_size):
#
#             time = random_date(d1, d2)
#
#             start_at1 = datetime.strptime('2020/1/11 00:00:00', '%Y/%m/%d %H:%M:%S')
#             end_at1 = datetime.strptime('2020/1/11 11:59:59', '%Y/%m/%d %H:%M:%S')
#             start_at2 = datetime.strptime('2020/1/11 12:00:00', '%Y/%m/%d %H:%M:%S')
#             end_at2 = datetime.strptime('2020/1/11 23:59:59', '%Y/%m/%d %H:%M:%S')
#
#             for i in range(100):
#
#                 query = "INSERT INTO timeslots(venue_id, event_id, start_at, end_at, created_at, updated_at)" + \
#                         " VALUES(%s, %s, %s, %s, %s, %s)"
#
#                 cursor.execute(query, (venue_id+1, None, start_at1, end_at1, time, time))
#                 print(cursor._last_executed)
#
#                 cursor.execute(query, (venue_id+1, None, start_at2, end_at2, time, time))
#                 print(cursor._last_executed)
#
#                 l = [1, 1, 1, 1, 1, 3, 3, 5, 7, 14, 14]
#                 next = random.choice(l)
#
#                 start_at1 = start_at1 + timedelta(days=next)
#                 end_at1 =  end_at1 + timedelta(days=next)
#                 start_at2 = start_at2 + timedelta(days=next)
#                 end_at2 = end_at2 + timedelta(days=next)
#                 time = time + timedelta(days=next)
#
#                 conn.commit()
#
# finally:
#     conn.close()


##### generate events #####
# 実行に必須なテーブル
# - venues
# - users
# - eventgenre
# - timeslots
# timeslotsのupdate_atが今日の日付になってしまうけどうまく修正できないので手動でなんとかしてる

# source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_users_t.sql; source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_venues_t.sql; source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_eventgenres_t.sql; source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_timeslots_t.sql;
#


# f = open('日本のまつりの名前一覧.txt','r')
# eventname_list = f.readlines()
# f.close()
#
# def get_eventname(i):
#     return eventname_list[i % len(eventname_list)].strip('\n')
#
# import random
# try:
#     with conn.cursor() as cursor:
#         for i in range(3000):
#             # commonな処理
#             # eventgenre取得
#             query = "SELECT id FROM eventgenres ORDER BY RAND() LIMIT 1;"
#             cursor.execute(query)
#             result = cursor.fetchone()
#             eventgenre_id = result['id']
#
#             # artist取得
#             query = "SELECT id FROM users WHERE role LIKE 'artist'  ORDER BY RAND() LIMIT 1;"
#             cursor.execute(query)
#             result = cursor.fetchone()
#             artist_id = result['id']
#
#             # timeslot取得
#             query = "SELECT * FROM timeslots WHERE event_id is NULL ORDER BY RAND() LIMIT 1;"
#             cursor.execute(query)
#             result = cursor.fetchone()
#             venue_id = result['venue_id']
#
#             # next timeslot取得
#             query = "SELECT * FROM timeslots WHERE id=%s AND venue_id=%s AND event_id is NULL"
#             cursor.execute(query, (result['id']+1, result['venue_id']))
#             result2 = cursor.fetchone()
#
#             # 連続してタイムスロットを予約するかのフラグ
#             double = True
#
#             # 連続して取ることができない場合
#             if result['id'] % 2 == 0 or result2 is None:
#                 double = False
#
#             # 70 %の確立でsingleにする
#             if random.randint(1, 100) < 70:
#                 double = False
#
#             if double == False:
#                 print("single")
#                 start_at1 = result['start_at'] + timedelta(hours=random.randint(1, 7))
#                 end_at1 = result['end_at'] - timedelta(hours=random.randint(2, 4))
#                 t1 = result['created_at']
#                 t2 = t1 + timedelta(days=30)
#                 created_at = random_date(t1, t2)
#
#                 print(created_at)
#
#                 query = "INSERT INTO events(user_id, venue_id, eventgenre_id, name, event_status,start_at, end_at, expose_at, " \
#                         "is_public, price, created_at, updated_at)" + \
#                         " VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
#
#                 cursor.execute(query, (artist_id, venue_id, eventgenre_id, get_eventname(i), "dummy_status", start_at1, end_at1,
#                                        created_at, True, 1000*random.randint(1, 15), created_at, created_at))
#
#                 event_id = cursor.lastrowid
#                 print(cursor._last_executed)
#
#                 query = "UPDATE timeslots SET event_id=%s WHERE id=%s"
#                 cursor.execute(query, (event_id, result['id']))
#
#                 print(cursor._last_executed)
#             else:
#
#                 start_at1 = result['start_at'] + timedelta(hours=random.randint(1, 7))
#                 end_at1 = result['end_at']
#                 start_at2 = result2['start_at']
#                 end_at2 = result2['end_at'] - timedelta(hours=random.randint(2, 4))
#                 t1 = result['created_at']
#                 t2 = t1 + timedelta(days=30)
#                 created_at = random_date(t1, t2)
#
#
#
#                 query = "INSERT INTO events(user_id, venue_id, eventgenre_id, name, event_status,start_at, end_at, expose_at, " \
#                         "is_public, price, created_at, updated_at)" + \
#                         " VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
#
#                 cursor.execute(query, (artist_id, venue_id, eventgenre_id, "dummy", "dummy_status", start_at1, end_at2,
#                                        created_at, True, 1000*random.randint(1, 15), created_at, created_at))
#                 event_id = cursor.lastrowid
#                 print(cursor._last_executed)
#
#                 query = "UPDATE timeslots SET event_id=%s WHERE id=%s"
#                 cursor.execute(query, (event_id, result['id']))
#                 print(cursor._last_executed)
#
#                 query = "UPDATE timeslots SET event_id=%s WHERE id=%s"
#                 cursor.execute(query, (event_id, result2['id']))
#                 print(cursor._last_executed)
#
#             conn.commit()
#
# finally:
#     conn.close()


#### generate reservations #####
# 実行に必須なテーブル
# - venues
# - users
# - eventgenre
# - timeslots
# - events
# source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_users_t.sql; source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_venues_t.sql; source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_eventgenres_t.sql; source /Users/kaz/n-isucon/N-ISUCON2020/app/db/mock/SELECT_t___FROM_app_timeslots_t.sql; source SELECT_t___FROM_app_events_t.sql;
#
import random

try:
    with conn.cursor() as cursor:
        # 予約テーブルを初期化
        query = "TRUNCATE TABLE reservations"
        cursor.execute(query)

        # ランダムで予約
        query = "SELECT id, venue_id,created_at,start_at FROM events;"
        cursor.execute(query)
        events = cursor.fetchall()
        for event in events:
            # events取得
            event_id = event['id']
            venue_id = event['venue_id']
            created_at = event['created_at']
            start_at = event['start_at']

            query = "SELECT capacity FROM venues WHERE id=%s"
            cursor.execute(query, venue_id)
            result = cursor.fetchone()
            cap = result['capacity']

            limit = random.randint(1, 500)
            query = "SELECT id FROM users WHERE role = 'audience' ORDER BY RAND() limit %s;"
            cursor.execute(query, limit)
            users = cursor.fetchall()

            current_resv = 0
            query = "INSERT INTO reservations(user_id, event_id, num_of_resv, created_at, updated_at) VALUES"
            values = []

            for user in users:
                if current_resv == cap:
                    break
                else:
                    if venue_id == 3:
                        num_of_resv = random.randint(1, 30)
                    else:
                        num_of_resv = random.randint(1, 5)

                    if cap - current_resv < num_of_resv:
                        num_of_resv = cap - current_resv

                user_id = user['id']
                time = random_date(created_at, start_at)
                value = "({},{},{},'{}','{}')".format(user_id, event_id, num_of_resv, time, time)
                values.append(value)

                current_resv += num_of_resv

            query += ','.join(values)
            cursor.execute(query,)
            #print(cursor._last_executed)
            conn.commit()

finally:
    conn.close()
