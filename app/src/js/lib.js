const mysql = require("mysql2");
const dotenv = require("dotenv");
const fs = require("fs");
const readline = require("readline");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

dotenv.config();

const REVOCATION_LIST_PATH = process.env.REVOCATION_LIST_PATH;
const JWT_SECRET = process.env.JWT_SECRET_KEY;

const errMsgs = {
  ERR400USER_REQ_USERNAME_AND_PASS:
    "Both of username and password are required.",
  ERR400_HAS_UNAVAILABLE_RESOURCE_ID: "Specified resource(s) are unavailable.",
  ERR400_MANDATORY: "Mandatory parameter(s) are missing.",
  ERR400_RESTRICTION: "Restriction violation(s) occur.",
  ERR400_TYPE_MISMATCH: "Type mismatch(es) exist.",
  ERR400_UNAVAILABLE_ROLE:
    "Role is invalid. Choose from 'audience' or 'artist'.",
  ERR401: "Invalid credentials.",
  ERR403: "Access declined.",
  ERR404: "Requested resource is not found.",
  ERR409EVENT_NOT_AVAILABLE_TS: "Selected timeslots are already reserved.",
  ERR409RESV_CONFLICT:
    "You've already reserved this event. To change the content, cancel and reserve it again.",
  ERR409RESV_SOLDOUT: "Tickets are all gone. ",
  ERR409USER_NOT_UNIQUIE_USERNAME:
    "A user who has same username exists. Consider using different username. ",
  ERR500: "Internal server error.",
};

class Util {
  constructor() {}

  static getSalt() {
    return crypto.randomBytes(64).toString("hex");
  }

  static getPasswordHash(salt, pass) {
    let hashed = pass + salt;
    for (let i = 0; i < 100; i++) {
      hashed = crypto.createHash("sha3-512").update(hashed).digest("hex");
    }
    return hashed;
  }

  static async isPasswordCorrect({ user }, password, conn) {
    let correct = true;
    const result = await this.getUserByName(user.username, conn);
    if (!result.hasOwnProperty("id")) {
      correct = false;
    }

    return this.getPasswordHash(user.salt, password) == result.password_hash;
  }

  static createToken({ user }) {
    const payload = {
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    };
    const option = { algorithm: "HS256" };
    return jwt.sign(payload, JWT_SECRET, option);
  }

  static async validateJWT(headers) {
    const err = new Error();
    let validateToken;
    if (!headers.hasOwnProperty("authorization")) {
      err.statusCode = 401;
      err.message = errMsgs.ERR401;
      throw err;
    }
    const token = headers.authorization.split("Bearer ").pop();

    if (await this._isRevokedToken(token)) {
      err.statusCode = 401;
      err.message = errMsgs.ERR401;
      throw err;
    }
    try {
      validateToken = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      err.statusCode = 401;
      err.message = errMsgs.ERR401;
      console.log(e);
      throw err;
    }

    return validateToken;
  }

  static async _isRevokedToken(token) {
    let ret = false;

    try {
      const time = new Date();
      await fs.utimesSync(REVOCATION_LIST_PATH, time, time);
    } catch (err) {
      await fs.closeSync(fs.openSync(REVOCATION_LIST_PATH, "w"));
    }
    const stream = fs.createReadStream(REVOCATION_LIST_PATH);
    const reader = readline.createInterface({ input: stream });
    for await (const line of reader) {
      if (line == token) {
        ret = true;
        break;
      }
    }
    return ret;
  }

  static async getUserByName(username, conn) {
    let user = {};
    const sql = "SELECT * FROM users WHERE username = ? ";
    let [rows, _] = await conn.query(sql, username).catch((err) => {
      console.log(err);
    });

    if (rows.length == 1) {
      user = rows[0];
    }
    return user;
  }

  static async getUser(id, conn) {
    let user = {};
    const sql = "SELECT * FROM users WHERE id = " + mysql.escape(id);
    let [rows, _] = await conn.query(sql).catch((err) => {
      console.log(err);
    });

    if (rows.length == 1) {
      user = rows[0];
    }
    return user;
  }

  static async getEvent(id, conn) {
    let event = {};
    const sql = "SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price, created_at, updated_at  FROM events WHERE id = " + mysql.escape(id);
    let [rows, _] = await conn.query(sql).catch((err) => {
      console.log(err);
    });

    if (rows.length == 1) {
      event = rows[0];
    }
    return event;
  }

  static async getVenue(id, conn) {
    let venue = {};
    const sql = "SELECT * FROM venues WHERE id = " + mysql.escape(id);
    let [rows, _] = await conn.query(sql, id).catch((err) => {
      console.log(err);
    });

    if (rows.length == 1) {
      venue = rows[0];
    }
    return venue;
  }

  static async getReservation(id, conn) {
    let reservation = {};
    const sql = "SELECT * FROM reservations WHERE id = " + mysql.escape(id);
    let [rows, fields] = await conn.query(sql).catch((err) => {
      console.log(err);
    });

    if (rows.length == 1) {
      reservation = rows[0];
    }
    return reservation;
  }

  static async getEventForUpdate(id, conn) {
    let event = {};
    const sql =
      "SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price, created_at, updated_at  FROM events WHERE id = " + mysql.escape(id) + " FOR UPDATE";
    let [rows, fields] = await conn.query(sql).catch((err) => {
      console.log(err);
    });

    if (rows.length == 1) {
      event = rows[0];
    }
    return event;
  }

  static async getTimeslotForUpdate(id, conn) {
    let timeslot = {};
    const sql =
      "SELECT * FROM timeslots WHERE id = " + mysql.escape(id) + " FOR UPDATE";
    let [rows, fields] = await conn.query(sql).catch((err) => {
      console.log(err);
    });

    if (rows.length == 1) {
      timeslot = rows[0];
    }
    return timeslot;
  }

  static async genEventResBody(event, conn) {
    event.event_name = event.name;
    delete event.name;
    event.event_genre_id = event.eventgenre_id;
    delete event.eventgenre_id;
    const artist = await this.getUser(event.user_id, conn);
    event.artist_id = artist.id;
    delete event.user_id;
    delete event.image;
    event.artist_name = artist.username;
    const venue = await this.getVenue(event.venue_id, conn);
    event.venue_name = venue.name;
    event.capacity = venue.capacity;
    const current_resv = await this.countReservationsByEvent(event.id, conn);
    event.current_resv = current_resv;
    const timeslot_ids = await this.getTimeSlotsIdsByEventId(event.id, conn);
    event.timeslot_ids = timeslot_ids;
    event.start_at = this.convertDateToResString(new Date(event.start_at));
    event.end_at = this.convertDateToResString(new Date(event.end_at));
    event.created_at = this.convertDateToResString(new Date(event.created_at));
    event.updated_at = this.convertDateToResString(new Date(event.updated_at));
    return event;
  }

  static async getTimeSlotsIdsByEventId(eventId, conn) {
    let ids = [];
    const sql =
      "SELECT * FROM timeslots WHERE event_id = " + mysql.escape(eventId);
    const [tss, _] = await conn.query(sql).catch((err) => {
      console.log(err);
    });

    for (const ts of tss) {
      ids.push(ts.id);
    }
    return ids;
  }

  static async genReservationResBody(reservation, conn) {
    const user = await this.getUser(reservation.user_id, conn);
    reservation.username = user.username;
    const event = await this.getEvent(reservation.event_id, conn);
    reservation.event_name = event.name;
    reservation.event_price = event.price;
    reservation.event_start_at = this.convertDateToResString(
      new Date(event.start_at)
    );
    reservation.event_end_at = this.convertDateToResString(
      new Date(event.end_at)
    );
    const venue = await this.getVenue(event.venue_id, conn);
    reservation.venue_name = venue.name;
    reservation.created_at = this.convertDateToResString(
      new Date(reservation.created_at)
    );
    reservation.updated_at = this.convertDateToResString(
      new Date(reservation.updated_at)
    );

    return reservation;
  }

  static async countReservationsByEvent(eventId, conn, forUpdate = false) {
    let count = 0;
    let sql =
      "SELECT * FROM reservations WHERE event_id = " + mysql.escape(eventId);
    if (forUpdate) {
      sql += " FOR UPDATE";
    }
    const [resvs, _] = await conn.query(sql).catch((err) => {
      console.log(err);
    });

    for (const resv of resvs) {
      count += resv.num_of_resv;
    }
    return count;
  }

  static convertDateToDBString(dt) {
    return new Date(dt)
      .toISOString()
      .replace("T", " ")
      .replace(/....Z$/, "");
  }

  static validateEventTimeLine(event, timeslots) {
    const err = Error();

    // Existance test
    if (timeslots.length != event.timeslot_ids.length) {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_HAS_UNAVAILABLE_RESOURCE_ID;
      throw err;
    }

    // time line is correct
    let tmpFirst = timeslots.reduce((a, b) =>
      a.start_at < b.start_at ? a.start_at : b.start_at
    );
    let tmpFinal = timeslots.reduce((a, b) =>
      a.end_at > b.end_at ? a.end_at : b.end_at
    );

    const dates = {
      ts_start: new Date(tmpFirst.start_at || tmpFirst),
      event_start: new Date(event.start_at),
      event_end: new Date(event.end_at),
      ts_end: new Date(tmpFinal.end_at || tmpFinal),
    };

    if (!this.isSameDates(dates.event_start, dates.event_end)) {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_RESTRICTION;
      throw err;
    }
    if (!this.isSameDates(dates.ts_start, dates.ts_end)) {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_RESTRICTION;
      throw err;
    }
    if (!this.isSameDates(dates.ts_start, dates.event_end)) {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_RESTRICTION;
      throw err;
    }

    // correct time line
    if (
      !(
        dates.ts_start.getTime() <= dates.event_start.getTime() &&
        dates.event_end.getTime() <= dates.ts_end.getTime() &&
        dates.event_start.getTime() < dates.event_end.getTime()
      )
    ) {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_RESTRICTION;
      throw err;
    }

    // Require same venue
    if (new Set(timeslots.map((ts) => ts.venue_id)).size != 1) {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_RESTRICTION;
      throw err;
    }

    return event;
  }

  static isSameDates(a, b) {
    let ret = false;
    if (a.getDate() == b.getDate()) {
      ret = true;
    }
    return ret;
  }

  static convertDateToResString(dt) {
    return new Date(dt).toISOString().replace(/....Z$/, "Z");
  }
}

module.exports = { Util, errMsgs };
