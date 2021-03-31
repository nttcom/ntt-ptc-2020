// k6 loadimpact 用のシナリオ

import http from 'k6/http';
import { check, group } from "k6";

//////// 変数・定数定義 ////////
let targetUrl = 'http://localhost:5000';
if (__ENV.TARGET_URL) {
    targetUrl = __ENV.TARGET_URL
}

//////// 初期データの読み込み ////////
const usernames = JSON.parse(open("./audiencesList.json"));
const artstsNames = JSON.parse(open("./artistsList.json"));
const ownerNames = JSON.parse(open("./ownersList.json"));
const expiredTokens = JSON.parse(open("./expired_token.json"));
const revokedTokens = JSON.parse(open("./revoked_token.json"));

// 画像 100枚
const imageFileNames = [...Array(100).keys()].map(i => `${i}.png`);
let eventImages = [];
imageFileNames.forEach(filename => {
    eventImages.push(open(`./images/${filename}`, 'b'));
})

//////// k6 Options ////////
const k6AudienceRate = parseInt(__ENV.K6_AUDIENCE_RATE)
const k6ArtistsRate = parseInt(__ENV.K6_ARTISTS_RATE)
const k6OwnersRate = parseInt(__ENV.K6_OWNERS_RATE)
const k6OldUsersRate = parseInt(__ENV.K6_OLD_USERS_RATE)
const k6AudienceTimeUnit = __ENV.K6_AUDIENCE_TIMEUNIT
const k6ArtistsTimeUnit = __ENV.K6_ARTISTS_TIMEUNIT
const k6OwnersTimeUnit = __ENV.K6_OWNERS_TIMEUNIT
const k6OldUsersTimeUnit = __ENV.K6_OLD_USERS_TIMEUNIT
const k6VU = parseInt(__ENV.K6_VU)
const k6Duration = '60s'

export let options = {
    userAgent: 'PTCBenchmarkers',
    scenarios: {
        audiences: {
            executor: 'constant-arrival-rate',
            rate: k6AudienceRate,
            timeUnit: k6AudienceTimeUnit,
            gracefulStop: '0s',
            preAllocatedVUs: k6VU * 1,
            maxVUs: k6VU * 1,
            exec: 'audiences',
            duration: k6Duration,
        },
        artists: {
            executor: 'constant-arrival-rate',
            rate: k6ArtistsRate,
            timeUnit: k6ArtistsTimeUnit,
            gracefulStop: '0s',
            preAllocatedVUs: k6VU * 1,
            maxVUs: k6VU * 1,
            exec: 'artists',
            duration: k6Duration,
        },
        owners: {
            executor: 'constant-arrival-rate',
            rate: k6OwnersRate,
            timeUnit: k6OwnersTimeUnit,
            gracefulStop: '0s',
            preAllocatedVUs: k6VU,
            maxVUs: k6VU,
            exec: 'owners',
            duration: k6Duration,
        },
        oldUsers: {
            executor: 'constant-arrival-rate',
            rate: k6OldUsersRate,
            timeUnit: k6OldUsersTimeUnit,
            gracefulStop: '0s',
            preAllocatedVUs: k6VU * 1,
            maxVUs: k6VU * 1,
            exec: 'oldUsers',
            duration: k6Duration,
        },
    },
}

//////// 関数定義 ////////
const getRand = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

const makeRandomString = (length = 8) => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
};

//////// ここからメイン: k6 シナリオ ////////

const defaultLimitNum = 12;
const maxVenueNum = 300;
const maxEventAvailableNum = 1700;

export function audiences() {

    // 静的ファイル取得
    group('GET static files', () => {
        const responses = http.batch([
            ["GET", `${targetUrl}/index.html`],
            ["GET", `${targetUrl}/favicon.ico`],
            ["GET", `${targetUrl}/js/app.js`],
            ["GET", `${targetUrl}/js/chunk-vendors.js`],
        ]);

        responses.forEach(i => {
            check(i, {
                "status is 200": r => r.status === 200
            });
        });
    });

    // ヘッダ設定
    const params = { headers: { "Content-Type": "application/json" } };

    // 75%が既存ユーザとする
    let jwt, username, password, userId;
    if (Math.random() >= 0.25) {
        // 既存ユーザ
        username = usernames[Math.floor(Math.random() * usernames.length)];
        password = 'password';
    } else {
        // 新規ユーザでサインアップ
        group('POST /api/users', () => {
            username = makeRandomString(20); //既存ユーザと衝突はまずありえない
            password = makeRandomString();
            const body = {
                username,
                password,
                role: "audience",
            };
            const resPostUser = http.post(`${targetUrl}/api/users`, JSON.stringify(body), params);
            check(resPostUser, {
                "status is 201": r => r.status === 201
            });
        });
    }

    // ログイン
    group('POST /api/login', () => {
        const body = {
            username: username,
            password: password,
            role: "audience",
        };
        const resPostLogin = http.post(`${targetUrl}/api/login`, JSON.stringify(body), params);
        check(resPostLogin, {
            "status is 200": r => r.status === 200
        });
        const resPostLoginObj = JSON.parse(resPostLogin.body);
        jwt = resPostLoginObj.access_token;
        userId = resPostLoginObj.user_id;
    });

    params.headers["Authorization"] = `Bearer ${jwt}`;
    let eventId;
    let eventIds;
    group('GET /api/events', () => {
        const offset = getRand(1, maxEventAvailableNum);
        const resGetEvents = http.get(`${targetUrl}/api/events?limit=${defaultLimitNum}&offset=${offset}`, params);
        check(resGetEvents, {
            "status is 200": r => r.status === 200
        });

        const events = JSON.parse(resGetEvents.body);
        eventId = events[Math.floor(Math.random() * events.length)].id;
        eventIds = events.map(e => e.id);
    });

    // 画像一覧を引っこ抜く
    group('GET /api/events/:id/image', () => {
        const requests = eventIds.map(eid => ['GET', `${targetUrl}/api/events/${eid}/image`, null, params]);
        const resImages = http.batch(requests);
        resImages.forEach(i => {
            check(i, {
                "status is 200": r => r.status === 200
            });
        });
    });

    // 公演詳細を確認
    group('GET /api/events/:id', () => {
        const resGetEvent = http.get(`${targetUrl}/api/events/${eventId}`,);
        check(resGetEvent, {
            "status is 200": r => r.status === 200
        });
    });

    // 新規チケット予約、イベント一覧にでたやつ全部
    group('POST /api/events/:id/reservations', () => {
        const requests = eventIds.map(eid => {
            return ['POST', `${targetUrl}/api/events/${eid}/reservations`, JSON.stringify({ num_of_resv: getRand(1, 20) }), params];
        });

        const resImages = http.batch(requests);
        resImages.forEach(i => {
            check(i, {
                "status is 201 or 409": r => r.status === 201 || r.status === 409
            });
        });
    });

    // 予約済みチケット一覧を確認
    let resvIds;
    group('GET /api/users/:user_id/reservations', () => {
        const resGetResvs = http.get(`${targetUrl}/api/users/${userId}/reservations`, params);
        check(resGetResvs, {
            "status is 200": r => r.status === 200
        });
        resvIds = JSON.parse(resGetResvs.body).map(r => r.id);
    });

    // 予約済みチケット1つの詳細を確認
    // GET http://127.0.0.1/api/reservations/{reservation_id}
    group('GET /api/reservations/:resv_id', () => {
        // 極稀に予約が一見もとれていないこともある。この場合は処理をリクエストを送らない。
        if (!(Array.isArray(resvIds) && resvIds.length)) {
            return;
        }

        const requests = resvIds.map(rid => {
            return ['GET', `${targetUrl}/api/reservations/${rid}`, null, params];
        });

        const resResvs = http.batch(requests);
        resResvs.forEach(i => {
            check(i, {
                "status is 200": r => r.status === 200
            });
        });
    });

    // チケットをキャンセルする
    group('DEL /api/reservations/:resv_id', () => {
        for (const rid of resvIds) {
            // 20%の確率でキャンセル
            if (Math.random() >= 0.8) {
                const resDelResv = http.del(`${targetUrl}/api/reservations/${rid}`, null, params);
                check(resDelResv, {
                    "status is 204": r => r.status === 204
                });
            }
        }
    });

    // ログアウト
    group('POST /api/logout', () => {
        const resPostLogout = http.post(`${targetUrl}/api/logout`, '', params);
        check(resPostLogout, {
            "status is 200": r => r.status === 200
        });
    });
}

// ベンチ前からあるArtists
export function artists() {
    const params = { headers: { "Content-Type": "application/json" } };

    // 75%が既存ユーザとする
    let jwt, username, password, userId;
    if (Math.random() >= 0.25) {
        // 既存ユーザ
        username = artstsNames[Math.floor(Math.random() * artstsNames.length)];
        password = 'password';
    } else {
        // 新規ユーザでサインアップ
        group('POST /api/users', () => {
            username = makeRandomString(20); //既存ユーザと衝突はまずありえない
            password = makeRandomString();
            const body = {
                username,
                password,
                role: "artist",
            };
            const resPostUser = http.post(`${targetUrl}/api/users`, JSON.stringify(body), params);
            check(resPostUser, {
                "status is 201": r => r.status === 201
            });
        });
    }

    // ログイン
    group('POST /api/login', () => {
        const body = {
            username,
            password,
        };
        const resPostLogin = http.post(`${targetUrl}/api/login`, JSON.stringify(body), params);
        check(resPostLogin, {
            "status is 200": r => r.status === 200
        });
        const resPostLoginObj = JSON.parse(resPostLogin.body);
        jwt = resPostLoginObj.access_token;
        userId = resPostLoginObj.user_id;
    });

    params.headers["Authorization"] = `Bearer ${jwt}`;
    let venueId;
    // 会場一覧を検索
    group('GET /api/venues', () => {
        const limit = 5;
        const offset = getRand(1, maxVenueNum);
        const resGetVenues = http.get(`${targetUrl}/api/venues?limit=${limit}&offset=${offset}`, params);
        check(resGetVenues, {
            "status is 200": r => r.status === 200
        });
        const venues = JSON.parse(resGetVenues.body);
        venueId = venues[Math.floor(Math.random() * venues.length)].id;
    });

    // ある会場の空き日程を確認
    let timeslot;
    group('GET /api/venues/:venue_id/timeslots', () => {
        const resGetTimeslots = http.get(`${targetUrl}/api/venues/${venueId}/timeslots`, params);
        check(resGetTimeslots, {
            "status is 200": r => r.status === 200
        });

        const timeslots = JSON.parse(resGetTimeslots.body);
        timeslot = timeslots[Math.floor(Math.random() * timeslots.length)];

        // todo: この時点で空きがない可能性もある
    });

    // 会場予約してイベントを作る
    let createdEventId;
    group('POST /api/events', () => {
        const body = {
            event_name: makeRandomString(),
            event_genre_id: 2,
            timeslot_ids: [
                timeslot.id
            ],
            price: getRand(100, 100000),
            start_at: timeslot.start_at,
            end_at: timeslot.end_at
        };
        const resPostEvent = http.post(`${targetUrl}/api/events`, JSON.stringify(body), params);
        check(resPostEvent, {
            "status is 201": r => r.status === 201
        });
        createdEventId = JSON.parse(resPostEvent.body).id;
    });

    group('PUT /api/events/:event_id/image', () => {
        const data = {
            image: http.file(eventImages[Math.floor(Math.random() * eventImages.length)], 'event.png', 'image/png'),
        }

        let authOnlyHeader = Object.assign({}, params);
        delete authOnlyHeader.headers['Content-Type'];

        const resPutEventImage = http.put(`${targetUrl}/api/events/${createdEventId}/image`, data, authOnlyHeader);
        check(resPutEventImage, {
            "status is 204": r => r.status === 204
        });
    });

    group('GET /api/events/:event_id/image', () => {
        let getParams = Object.assign({}, params);
        getParams.headers['Content-Type'] = 'image/png';

        const resGetImage = http.get(`${targetUrl}/api/events/${createdEventId}/image`, getParams);
        check(resGetImage, {
            "status is 200": r => r.status === 200
        });
    });

    // 会場予約したイベントをみる
    let createdEvent;
    group('GET /api/events/:event_id', () => {
        const resGetEvent = http.get(`${targetUrl}/api/events/${createdEventId}`, params);
        check(resGetEvent, {
            "status is 200": r => r.status === 200
        });
        createdEvent = JSON.parse(resGetEvent.body);
    });

    // 予約を変更する
    let eventForPut;
    let changedPrice;
    group('PUT /api/events/:event_id', () => {
        params.headers['Content-Type'] = 'application/json';
        changedPrice = getRand(100, 100000);
        eventForPut = {
            event_name: createdEvent.event_name,
            event_genre_id: getRand(1, 13),
            timeslot_ids: [
                timeslot.id
            ],
            price: changedPrice,
            start_at: timeslot.start_at,
            end_at: timeslot.end_at
        };
        const resPutEvent = http.put(`${targetUrl}/api/events/${createdEventId}`, JSON.stringify(eventForPut), params);
        check(resPutEvent, {
            "status is 200": r => r.status === 200
        });
    });

    // 予約した変更したイベントをみる
    group('GET /api/events/:event_id', () => {
        const resGetEvent = http.get(`${targetUrl}/api/events/${createdEventId}`, params);

        // 色々変更項目あるが、今回は価格変更だけ見てみる、重くなるので全部チェックしなくても良いと判断
        check(resGetEvent, {
            "status is 200": r => r.status === 200,
            "price is changed value": r => r.json().price === changedPrice
        });
    });

    // 予約変更したときにくっついてくる画像もみる
    group('GET /api/events/:event_id/image', () => {
        let getParams = Object.assign({}, params);
        getParams.headers['Content-Type'] = 'image/png';

        const resGetImage = http.get(`${targetUrl}/api/events/${createdEventId}/image`, getParams);
        check(resGetImage, {
            "status is 200": r => r.status === 200
        });
    });

    // あるイベントに対する予約者一覧を見る
    // http://127.0.0.1/api/events/{event_id}/reservations
    group('GET /api/events/:event_id/reservations', () => {
        params.headers['Content-Type'] = 'application/json';
        const resGetEventResv = http.get(`${targetUrl}/api/events/${createdEventId}/reservations`, params);

        check(resGetEventResv, {
            "status is 200": r => r.status === 200,
        });
    });

    // 最後にログアウトする
    group('POST /api/logout', () => {
        const resPostLogout = http.post(`${targetUrl}/api/logout`, '', params);
        check(resPostLogout, {
            "status is 200": r => r.status === 200
        });
    });
}

// オーナー
export function owners() {
    const params = { headers: { "Content-Type": "application/json" } };

    // ログイン
    let jwt;
    group('POST /api/login', () => {
        // 既存ユーザ
        const body = {
            username: ownerNames[Math.floor(Math.random() * ownerNames.length)],
            password: 'password'
        };
        const resPostLogin = http.post(`${targetUrl}/api/login`, JSON.stringify(body), params);
        check(resPostLogin, {
            "status is 200": r => r.status === 200
        });
        jwt = JSON.parse(resPostLogin.body).access_token;
    });

    params.headers["Authorization"] = `Bearer ${jwt}`;
    let eventId, eventIds;
    group('GET /api/events', () => {
        const offset = getRand(1, maxEventAvailableNum);
        const resGetEvents = http.get(`${targetUrl}/api/events?limit=${defaultLimitNum}&offset=${offset}`, params);
        check(resGetEvents, {
            "status is 200": r => r.status === 200
        });

        const events = JSON.parse(resGetEvents.body);
        eventId = events[Math.floor(Math.random() * events.length)].id;
        eventIds = events.map(e => e.id);
    });

    // ジャンルをひく
    group('GET /api/genres', () => {
        const resEventGenre = http.get(`${targetUrl}/api/genres`, params);
        check(resEventGenre, {
            "status is 200": r => r.status === 200
        });
    });

    // 画像一覧を引っこ抜く
    group('GET /api/events/:id/image', () => {
        const requests = eventIds.map(eid => ['GET', `${targetUrl}/api/events/${eid}/image`, null, params]);
        const resImages = http.batch(requests);
        resImages.forEach(i => {
            check(i, {
                "status is 200": r => r.status === 200
            });
        });
    });

    // 公演詳細を確認
    group('GET /api/events/:id', () => {
        const resGetEvent = http.get(`${targetUrl}/api/events/${eventId}`, params);
        check(resGetEvent, {
            "status is 200": r => r.status === 200
        });
    });

    // 予約者一覧をみる、何ページか
    group('GET /api/events/:id/reservations', () => {
        // 画像一覧を引っこ抜く
        const requests = eventIds.map(eid => ['GET', `${targetUrl}/api/events/${eid}/reservations`, null, params]);
        const resEventResvs = http.batch(requests);
        resEventResvs.forEach(i => {
            check(i, {
                "status is 200": r => r.status === 200
            });
        });
    });

    // 最後にログアウトする
    group('POST /api/logout', () => {
        const resPostLogout = http.post(`${targetUrl}/api/logout`, '', params);
        check(resPostLogout, {
            "status is 200": r => r.status === 200
        });
    })

}

// 古いjwtで、logout失敗するリクエスト
export function oldUsers() {
    // 古いTokenを設定する。Expiredが2/3、Revokeが1/3。
    let jwt;
    if (Math.random() >= 10) {
        jwt = expiredTokens[Math.floor(Math.random() * expiredTokens.length)];
    } else {
        jwt = revokedTokens[Math.floor(Math.random() * revokedTokens.length)];
    }

    // ログイン
    const params = {
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${jwt}`,
        }
    };

    // イベント一覧GET
    let eventId;
    group('GET /api/events', () => {
        const offset = getRand(1, maxEventAvailableNum);
        const resGetEvents = http.get(`${targetUrl}/api/events?limit=${defaultLimitNum}&offset=${offset}`, params);
        check(resGetEvents, {
            "status is 200": r => r.status === 200
        });

        const events = JSON.parse(resGetEvents.body);
        eventId = events[Math.floor(Math.random() * events.length)].id;
    });

    // 最後にログアウトする
    group('POST /api/logout', () => {
        const resPostLogout = http.post(`${targetUrl}/api/logout`, '', params);
        check(resPostLogout, {
            "status is 401": r => r.status === 401
        });
    })
}
