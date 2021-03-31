const childProcess = require("child_process");
const dotenv = require("dotenv");
const fs = require("fs");
const mysql = require("mysql2");
const path = require("path");
const util = require("util");

const exec = util.promisify(childProcess.exec);

dotenv.config();
const { Util, errMsgs } = require("./lib");

const APP_PORT = 5000;
const REVOCATION_LIST_PATH = process.env.REVOCATION_LIST_PATH;

const cnx = mysql
  .createPool({
    connectionLimit: 10,
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  })
  .promise();

const fastify = require("fastify")({
  logger: true,
});

fastify.register(require("fastify-multipart"));
fastify.register(require("fastify-static"), {
  root: path.join(__dirname, "public"),
});

const {
  authHeaders,
  getUserSchema,
  postSignUpSchema,
  postLoginSchema,
  listEventsSchema,
  postEventSchema,
  putEventSchema,
  getEventSchema,
  getEventImageSchema,
  putEventImageSchema,
  getReservationSchema,
  postReservationSchema,
  delReservationSchema,
  listReservationsByEventSchema,
  listReservationsByUsersSchema,
  listVenuesSchema,
  listTimeslotsOfVenueSchema,
} = require("./schema");

fastify.get("/", async (request, reply) => {
  reply.sendFile("index.html");
});

// users api
fastify.route({
  method: "POST",
  url: "/api/users",
  schema: postSignUpSchema,
  handler: async (request, reply) => {
    const err = new Error();
    const user = request.body;

    await cnx.query("use " + process.env.MYSQL_DATABASE);
    const existUser = await Util.getUserByName(user.username, cnx);
    const salt = Util.getSalt();
    if (existUser.hasOwnProperty("username")) {
      err.statusCode = 409;
      err.message = errMsgs.ERR409USER_NOT_UNIQUIE_USERNAME;
      throw err;
    }
    const sql =
      "INSERT INTO users(username, role, password_hash, salt) VALUES(?, ?, ?, ?)";

    const [res] = await cnx
      .query(sql, [
        user.username,
        user.role,
        Util.getPasswordHash(salt, user.password),
        salt,
      ])
      .catch((err) => {
        console.log(err);
      });
    await cnx.query("COMMIT");

    reply.code(201).send({
      user_id: res.insertId,
      username: user.username,
      role: user.role,
    });
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "POST",
  url: "/api/login",
  schema: postLoginSchema,
  handler: async (request, reply) => {
    const err = new Error();
    const user = await Util.getUserByName(request.body.username, cnx);
    let token;

    if (!user.hasOwnProperty("username")) {
      err.statusCode = 401;
      err.message = errMsgs.ERR401;
      throw err;
    }

    if (await Util.isPasswordCorrect({ user }, request.body.password, cnx)) {
      token = Util.createToken({ user });
    } else {
      err.statusCode = 401;
      err.message = errMsgs.ERR401;
      throw err;
    }

    return { user_id: user.id, access_token: token };
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.post("/api/logout", async (request, reply) => {
  await Util.validateJWT(request.headers);
  const token = request.headers.authorization.split("Bearer ").pop();
  const fd = fs.openSync(REVOCATION_LIST_PATH, "a");
  fs.writeSync(fd, token + "\n");
  fs.closeSync(fd);

  return { message: "logout succeed" };
});

fastify.route({
  method: "GET",
  url: "/api/users/:user_id",
  schema: getUserSchema,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const userId = request.params.user_id;
    const user = await Util.getUser(userId, cnx);

    if (
      (token.role == "audience" || token.role == "artist") &&
      token.username != user.username
    ) {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }

    if (!user.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }

    return { user_id: user.id, username: user.username, role: user.role };
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

// events api

fastify.route({
  method: "GET",
  url: "/api/events",
  schema: listEventsSchema,
  handler: async (request, reply) => {
    let sql = "SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price, created_at, updated_at FROM `events` WHERE DATE(NOW()) <= start_at";

    const userId = request.query.user_id;
    const limit = request.query.limit || 12;
    const offset = request.query.offset || 0;
    if (userId !== undefined) {
      sql += " AND user_id = " + mysql.escape(userId);
    }

    sql += " LIMIT " + mysql.escape(limit) + " OFFSET " + mysql.escape(offset);

    let [events, _] = await cnx.query(sql).catch((err) => {
      console.log(err);
    });

    for (let event of events) {
      event = await Util.genEventResBody(event, cnx);
    }

    return events;
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "POST",
  url: "/api/events",
  schema: postEventSchema,
  preValidation: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    if (token.role != "artist") {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }
  },
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const user = await Util.getUserByName(token.username, cnx);
    let event = request.body;
    let sql, insertedId, insertedEvent;
    let timeslots = [];

    sql =
      "SELECT * FROM eventgenres WHERE id = " +
      mysql.escape(event.event_genre_id);
    [rows, fields] = await cnx.query(sql, event.event_genre_id).catch((err) => {
      console.log(err);
    });

    if (rows.length != 1) {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_HAS_UNAVAILABLE_RESOURCE_ID;
      throw err;
    }

    const conn = await cnx.getConnection();
    try {
      await conn.query("BEGIN");
      for await (const tsId of event.timeslot_ids) {
        timeslots.push(await Util.getTimeslotForUpdate(tsId, conn));
      }
      Util.validateEventTimeLine(event, timeslots);

      for (const ts of timeslots) {
        if (ts.event_id != null) {
          err.statusCode = 409;
          err.message = errMsgs.ERR409EVENT_NOT_AVAILABLE_TS;
          throw err;
        }
      }

      sql =
        "INSERT INTO events (user_id, venue_id, eventgenre_id, name, start_at, end_at, price) VALUES (?, ?, ?, ?, ?, ?, ? )";
      [rows, fields] = await conn
        .query(sql, [
          user.id,
          timeslots[0].venue_id,
          event.event_genre_id,
          event.event_name,
          Util.convertDateToDBString(new Date(event.start_at)),
          Util.convertDateToDBString(new Date(event.end_at)),
          event.price,
        ])
        .catch((err) => {
          console.log(err);
        });
      insertedId = rows.insertId;

      sql =
        "UPDATE timeslots SET event_id = ? WHERE id = ? AND event_id IS NULL";
      for (const ts of timeslots) {
        [rows, _] = await conn.query(sql, [insertedId, ts.id]).catch((err) => {
          console.log(err);
        });
      }

      await conn.query("COMMIT").catch((err) => {
        console.log(err);
      });
    } catch (e) {
      await conn.query("ROLLBACK");
      throw e;
    } finally {
      await conn.release();
    }

    insertedEvent = await Util.getEvent(insertedId, cnx);

    //Extra keys in response: {'name', 'user_id', 'image', 'eventgenre_id'}
    // Make response
    event.id = insertedId;
    event.artist_id = user.id;
    event.artist_name = user.username;
    event.venue_id = timeslots[0].venue_id;
    const venue = await Util.getVenue(timeslots[0].venue_id, cnx);
    event.venue_name = venue.name;
    event.capacity = venue.capacity;
    event.current_resv = 0;
    event.start_at = Util.convertDateToResString(
      new Date(insertedEvent.start_at)
    );
    event.end_at = Util.convertDateToResString(new Date(insertedEvent.end_at));
    event.created_at = Util.convertDateToResString(
      new Date(insertedEvent.created_at)
    );
    event.updated_at = Util.convertDateToResString(
      new Date(insertedEvent.updated_at)
    );

    reply.code(201).send(event);
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "GET",
  url: "/api/events/:event_id",
  schema: getEventSchema,
  handler: async (request, reply) => {
    const err = Error();
    const eventId = request.params.event_id;

    let event = await Util.getEvent(eventId, cnx);
    if (!event.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }

    event = await Util.genEventResBody(event, cnx);

    return event;
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "PUT",
  url: "/api/events/:event_id",
  schema: putEventSchema,
  preValidation: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    if (token.role == "audience") {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }
  },
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const user = await Util.getUserByName(token.username, cnx);
    const eventId = request.params.event_id;
    let current = await Util.getEvent(eventId, cnx);
    let event = request.body;
    let timeslots = [];
    let sql;

    if (!current.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }

    if (user.id != current.user_id && token.role == "artist") {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }

    sql =
      "SELECT * FROM eventgenres WHERE id = " +
      mysql.escape(event.event_genre_id);
    [rows, fields] = await cnx.query(sql).catch((err) => {
      console.log(err);
    });

    if (rows.length != 1) {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_HAS_UNAVAILABLE_RESOURCE_ID;
      throw err;
    }
    const conn = await cnx.getConnection();
    try {
      await conn.query("BEGIN");
      for await (const tsId of event.timeslot_ids) {
        timeslots.push(await Util.getTimeslotForUpdate(tsId, conn));
      }
      Util.validateEventTimeLine(event, timeslots);

      for (const ts of timeslots) {
        if (!(ts.event_id == null || ts.event_id == eventId)) {
          err.statusCode = 409;
          err.message = errMsgs.ERR409EVENT_NOT_AVAILABLE_TS;
          throw err;
        }
      }

      current = await Util.getEventForUpdate(eventId, conn);

      sql =
        "UPDATE events SET eventgenre_id=?, name=?, venue_id=?,  start_at=?, end_at=?, price=? WHERE id =?";
      [rows, fields] = await conn
        .query(sql, [
          event.event_genre_id,
          event.event_name,
          timeslots[0].venue_id,
          Util.convertDateToDBString(new Date(event.start_at)),
          Util.convertDateToDBString(new Date(event.end_at)),
          event.price,
          eventId,
        ])
        .catch((err) => {
          console.log(err);
        });

      // Un-assigned the current
      sql = "UPDATE timeslots SET event_id = NULL WHERE event_id = ? ";
      [rows, fields] = await conn.query(sql, eventId).catch((err) => {
        console.log(err);
      });
      // Re-assigned
      sql =
        "UPDATE timeslots SET event_id=? WHERE id = ? AND event_id IS  NULL";
      for (const ts of timeslots) {
        [rows, fields] = await conn
          .query(sql, [eventId, ts.id])
          .catch((err) => {
            console.log(err);
          });
      }

      await conn.query("COMMIT").catch((err) => {
        console.log(err);
      });
    } catch (e) {
      await conn.query("ROLLBACK");
      throw e;
    } finally {
      await conn.release();
    }

    updatedEvent = await Util.getEvent(eventId, cnx);
    updatedEvent = await Util.genEventResBody(updatedEvent, cnx);
    reply.code(200).send(updatedEvent);
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "GET",
  url: "/api/events/:event_id/image",
  schema: getEventImageSchema,
  handler: async (request, reply) => {
    const err = Error();
    const eventId = request.params.event_id;
    const sql = "SELECT image FROM events WHERE id = ?";
    let event = {};

    const [rows, fields] = await cnx
      .query(sql, eventId)
      .catch((err) => {
        console.log(err);
      });
    if (rows.length == 1) {
      event = rows[0];
    }

    if (!event.hasOwnProperty("image")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }

    if (event.image != null) {
      const image = new Buffer.from(event.image.toString(), "base64");
      reply.code(200).header("content-type", "image/png").send(image);
    } else {
      reply.sendFile("img/default.png");
    }
  },
  onSend: async (request, reply, payload) => {
    if (typeof payload == "string") {
      reply.header("content-type", "application/json");
    } else {
      reply.header("content-type", "image/png");
    }
  },
});

fastify.route({
  method: "PUT",
  url: "/api/events/:event_id/image",
  schema: putEventImageSchema,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const eventId = request.params.event_id;
    const user = await Util.getUserByName(token.username, cnx);
    const event = await Util.getEvent(eventId, cnx);
    if (!event.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }
    if (token.role == "audience") {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }
    if (event.user_id != user.id && user.role == "artist") {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }
    const data = await request.file();
    if (data.mimetype != "image/png") {
      err.statusCode = 400;
      err.message = errMsgs.ERR400_TYPE_MISMATCH;
      throw err;
    }

    let buffer = await data.toBuffer();
    const encodedImage = buffer.toString("base64");
    const sql = "UPDATE events SET image=? WHERE id=?";
    const [result, fields] = await cnx
      .query(sql, [encodedImage, eventId])
      .catch((err) => {
        console.log(err);
      });

    await cnx.query("COMMIT");
    reply.code(204).send({ message: "Upload Succeeded" });
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

// eventgenres api

fastify.route({
  method: "GET",
  url: "/api/genres",
  schema: authHeaders,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);

    if (token.role == "audience") {
      err.statusCode = 403;
      err.message = errMsgs.ERR400_TYPE_MISMATCH;
      throw err;
    }
    const sql = "SELECT * FROM eventgenres";
    const [genres, fields] = await cnx.query(sql).catch((err) => {
      console.log(err);
    });

    return genres;
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

// reservations api

fastify.route({
  method: "GET",
  url: "/api/reservations/:reservation_id",
  schema: getReservationSchema,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const user = await Util.getUserByName(token.username, cnx);
    let reservation = await Util.getReservation(
      request.params.reservation_id,
      cnx
    );

    if (!reservation.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }

    if (
      token.role == "artist" ||
      (token.role == "audience" && user.id != reservation.user_id)
    ) {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }

    reservation = Util.genReservationResBody(reservation, cnx);

    return reservation;
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "GET",
  url: "/api/users/:user_id/reservations",
  schema: listReservationsByUsersSchema,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const limit = request.query.limit || 5;
    const offset = request.query.offset || 0;
    const userId = request.params.user_id;
    const tokenUser = await Util.getUserByName(token.username, cnx);
    const user = await Util.getUser(userId, cnx);
    if (!user.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }
    if (
      token.role == "artist" ||
      (token.role == "audience" && userId != tokenUser.id)
    ) {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }

    let sql =
      "SELECT * FROM reservations WHERE user_id = ? LIMIT " +
      mysql.escape(limit) +
      " OFFSET ?";

    let [reservations, fields] = await cnx
      .query(sql, [userId, offset])
      .catch((err) => {
        console.log(err);
      });

    for (let resv of reservations) {
      resv = await Util.genReservationResBody(resv, cnx);
    }
    return reservations;
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "GET",
  url: "/api/events/:event_id/reservations",
  schema: listReservationsByEventSchema,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const limit = request.query.limit || 10;
    const offset = request.query.offset || 0;
    const eventId = request.params.event_id;
    const event = await Util.getEvent(eventId, cnx);
    if (!event.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }
    const user = await Util.getUserByName(token.username, cnx);
    if (
      token.role == "audience" ||
      (token.role == "artist" && event.user_id != user.id)
    ) {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }

    let sql =
      "SELECT * FROM reservations WHERE event_id = ? LIMIT " +
      mysql.escape(limit) +
      " OFFSET ?";

    let [reservations, fields] = await cnx
      .query(sql, [eventId, offset])
      .catch((err) => {
        console.log(err);
      });

    for (let resv of reservations) {
      resv = await Util.genReservationResBody(resv, cnx);
    }
    return reservations;
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "DELETE",
  url: "/api/reservations/:reservation_id",
  schema: delReservationSchema,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const reservationId = request.params.reservation_id;

    let reservation = await Util.getReservation(reservationId, cnx);

    if (!reservation.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }

    const user = await Util.getUserByName(token.username, cnx);
    if (!(user.id == reservation.user_id || user.role == "owner")) {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }

    const sql =
      "DELETE FROM reservations WHERE id = " + mysql.escape(reservationId);
    const [rows, fields] = await cnx.query(sql).catch((err) => {
      console.log(err);
    });
    reply.code(204);
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "POST",
  url: "/api/events/:event_id/reservations",
  schema: postReservationSchema,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const user = await Util.getUserByName(token.username, cnx);
    const num_of_resv = request.body.num_of_resv;
    const eventId = request.params.event_id;
    let insertedId, sql, rows;

    if (token.role != "audience") {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }

    const event = await Util.getEvent(request.params.event_id, cnx);
    if (!event.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }

    const venue = await Util.getVenue(event.venue_id, cnx);
    const conn = await cnx.getConnection();
    try {
      await conn.query("BEGIN");
      await conn.query("LOCK TABLES reservations WRITE");

      sql = "SELECT * FROM reservations WHERE event_id = ? AND user_id = ?";
      [rows] = await conn.query(sql, [eventId, user.id]);

      if (rows.length > 0) {
        err.statusCode = 409;
        err.message = errMsgs.ERR409RESV_CONFLICT;
        throw err;
      }

      const count = await Util.countReservationsByEvent(eventId, conn);
      if (count + num_of_resv > venue.capacity) {
        err.statusCode = 409;
        err.message = errMsgs.ERR409RESV_SOLDOUT;
        throw err;
      }

      sql =
        "INSERT INTO reservations(user_id, event_id, num_of_resv) VALUES(?, ?, ?) ";
      const [result] = await conn.query(sql, [user.id, event.id, num_of_resv]);

      insertedId = result.insertId;

      await conn.query("UNLOCK TABLE");
      await conn.query("COMMIT");
    } catch (e) {
      await conn.query("UNLOCK TABLE");
      await conn.query("ROLLBACK");
      console.log(e);
      throw e;
    } finally {
      await conn.release();
    }
    let reservation = await Util.getReservation(insertedId, cnx);
    reservation = await Util.genReservationResBody(reservation, cnx);
    reply.code(201).send(reservation);
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

// venues api
fastify.route({
  method: "GET",
  url: "/api/venues",
  schema: listVenuesSchema,
  handler: async (request, reply) => {
    await Util.validateJWT(request.headers);
    const limit = request.query.limit || 5;
    const offset = request.query.offset || 0;

    const sql = "SELECT * FROM venues LIMIT ? OFFSET ?";
    const [venues, fields] = await cnx
      .query(sql, [limit, offset])
      .catch((err) => {
        console.log(err);
      });

    for (const venue of venues) {
      venue.created_at = Util.convertDateToResString(venue.created_at);
      venue.updated_at = Util.convertDateToResString(venue.updated_at);
    }

    return venues;
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

fastify.route({
  method: "GET",
  url: "/api/venues/:venue_id/timeslots",
  schema: listTimeslotsOfVenueSchema,
  handler: async (request, reply) => {
    const err = Error();
    const token = await Util.validateJWT(request.headers);
    const venueId = request.params.venue_id;
    let from = request.query.from || new Date();
    let to =
      request.query.to ||
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    from = Util.convertDateToDBString(from);
    to = Util.convertDateToDBString(to);
    if (token.role == "audience") {
      err.statusCode = 403;
      err.message = errMsgs.ERR403;
      throw err;
    }

    const venue = await Util.getVenue(venueId, cnx);
    if (!venue.hasOwnProperty("id")) {
      err.statusCode = 404;
      err.message = errMsgs.ERR404;
      throw err;
    }

    let sql =
      "SELECT * FROM timeslots WHERE venue_id = ? AND event_id IS NULL AND ? <= start_at AND start_at <= ?";
    const [timeslots, fields] = await cnx
      .query(sql, [venueId, from, to])
      .catch((err) => {
        console.log(err);
      });

    for (const ts of timeslots) {
      ts.start_at = Util.convertDateToResString(new Date(ts.start_at));
      ts.end_at = Util.convertDateToResString(new Date(ts.end_at));
      ts.created_at = Util.convertDateToResString(new Date(ts.created_at));
      ts.updated_at = Util.convertDateToResString(new Date(ts.updated_at));
    }

    return timeslots;
  },
  onSend: async (request, reply, payload) => {
    reply.header("content-type", "application/json");
  },
});

// other api
fastify.post("/api/initialize", async (request, reply) => {
  let cmd = "scripts/init.sh";
  const res = await exec(cmd);
  // 販促実施に応じて，ここの値を変更してください
  // 詳しくは，specを参照してください．
  // https://portal.ptc.ntt.dev/spec.html#tag/other

  return 1
});

fastify.setErrorHandler(function (error, request, reply) {
  console.log(error);
  console.log(request.headers);
  console.log(request.body);
  const code = error.statusCode || 500;
  if (error.validation !== undefined) {
    reply.code(400).send({ message: error.validation[0].message });
  } else {
    reply.code(code).send({ message: error.message });
  }
});

fastify.listen(APP_PORT, "0.0.0.0", (err, address) => {
  if (err) throw err;
  fastify.log.info(`server listening on ${address}`);
});
