// Auth Header Schema
const authHeaders = {
  headers: {
    type: "object",
    properties: {
      Authorization: { type: "string", pattern: "^Bearer .*" },
    },
  },
};

// User Schemas
const postSignUpSchema = {
  body: {
    type: "object",
    properties: {
      username: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 1 },
      role: { type: "string", enum: ["audience", "artist"] },
    },
    additionalProperties: false,
    required: ["username", "password", "role"],
  },
  response: {
    201: {
      type: "object",
      properties: {
        user_id: { type: "integer" },
        username: { type: "string" },
        role: { type: "string", enum: ["audience", "artist"] },
      },
    },
  },
};

const postLoginSchema = {
  body: {
    type: "object",
    properties: {
      username: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
    required: ["username", "password"],
  },
};

const getUserSchema = {
  headers: authHeaders,
  params: {
    properties: {
      user_id: { type: "integer" },
    },
    required: ["user_id"],
  },
};

// Event Schemas
const _resEventBodySchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    event_name: { type: "string" },
    event_genre_id: { type: "integer" },
    artist_id: { type: "integer" },
    artist_name: { type: "string" },
    venue_id: { type: "integer" },
    venue_name: { type: "string" },
    timeslot_ids: {
      type: "array",
      items: {
        type: "integer",
        minLength: 1,
        maxLength: 2,
        uniqueItems: true,
      },
    },
    price: { type: "integer" },
    start_at: { type: "string", format: "date-time" },
    end_at: { type: "string", format: "date-time" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    capacity: { type: "integer" },
    current_resv: { type: "integer" },
  },
  required: [
    "id",
    "event_name",
    "event_genre_id",
    "artist_id",
    "artist_name",
    "venue_id",
    "venue_name",
    "timeslot_ids",
    "price",
    "start_at",
    "end_at",
    "created_at",
    "updated_at",
    "capacity",
    "current_resv",
  ],
};

const _reqEventBodySchema = {
  type: "object",
  properties: {
    event_name: { type: "string", minLength: 1 },
    event_genre_id: { type: "integer" },
    timeslot_ids: {
      type: "array",
      items: {
        type: "integer",
      },
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
    },
    price: { type: "integer", minimum: 1 },
    start_at: { type: "string", format: "date-time" },
    end_at: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
  required: [
    "event_name",
    "event_genre_id",
    "timeslot_ids",
    "price",
    "start_at",
    "end_at",
  ],
};

const listEventsSchema = {
  querystring: {
    properties: {
      user_id: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 0 },
      offset: { type: "integer", minimum: 0 },
    },
  },
  additionalProperties: false,
  response: {
    200: { type: "array", items: _resEventBodySchema },
  },
};

const postEventSchema = {
  headers: authHeaders,
  body: _reqEventBodySchema,
  response: {
    200: _resEventBodySchema,
  },
};

const getEventSchema = {
  params: {
    properties: {
      event_id: { type: "integer" },
    },
    additionalProperties: false,
    required: ["event_id"],
  },
  response: {
    200: _resEventBodySchema,
  },
};

const putEventSchema = {
  headers: authHeaders,
  params: {
    properties: {
      event_id: { type: "integer" },
    },
    required: ["event_id"],
  },
  body: _reqEventBodySchema,
  response: {
    200: _resEventBodySchema,
  },
};

const getEventImageSchema = {
  params: {
    properties: {
      event_id: { type: "integer" },
    },
    additionalProperties: false,
    required: ["event_id"],
  },
};

const putEventImageSchema = {
  headers: authHeaders,
  params: {
    properties: {
      event_id: { type: "integer" },
    },
    additionalProperties: false,
    required: ["event_id"],
  },
};

// Event Genre Schemas

// Reservations Schemas

const _resReservationsBodySchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    user_id: { type: "integer" },
    username: { type: "string" },
    event_id: { type: "integer" },
    event_name: { type: "string" },
    event_price: { type: "integer" },
    event_start_at: { type: "string", format: "date-time" },
    event_end_at: { type: "string", format: "date-time" },
    venue_name: { type: "string" },
    num_of_resv: { type: "integer" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
};

const getReservationSchema = {
  headers: authHeaders,
  params: {
    properties: {
      reservation_id: { type: "integer" },
    },
    required: ["reservation_id"],
  },
  response: {
    200: _resReservationsBodySchema,
  },
};

const postReservationSchema = {
  headers: authHeaders,
  params: {
    properties: {
      event_id: { type: "integer" },
    },
    required: ["event_id"],
  },
  body: {
    type: "object",
    properties: {
      num_of_resv: { type: "integer", minimum: 1 },
    },
    additionalProperties: false,
    required: ["num_of_resv"],
  },
  response: {
    201: _resReservationsBodySchema,
  },
};

const delReservationSchema = {
  headers: authHeaders,
  params: {
    properties: {
      reservation_id: { type: "integer" },
    },
    required: ["reservation_id"],
  },
};

const listReservationsByEventSchema = {
  headers: authHeaders,
  params: {
    properties: {
      event_id: { type: "integer" },
    },
    required: ["event_id"],
  },
  querystring: {
    properties: {
      limit: { type: "integer", minimum: 0 },
      offset: { type: "integer", minimum: 0 },
    },
  },
  response: {
    200: { type: "array", items: _resReservationsBodySchema },
  },
};

const listReservationsByUsersSchema = {
  headers: authHeaders,
  params: {
    properties: {
      user_id: { type: "integer" },
    },
    required: ["user_id"],
  },
  querystring: {
    properties: {
      limit: { type: "integer", minimum: 0 },
      offset: { type: "integer", minimum: 0 },
    },
  },
  response: {
    200: { type: "array", items: _resReservationsBodySchema },
  },
};

// Venue Schemas
const listVenuesSchema = {
  headers: authHeaders,
  querystring: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 0 },
      offset: { type: "integer", minimum: 0 },
    },
  },
};

const listTimeslotsOfVenueSchema = {
  headers: authHeaders,
  querystring: {
    type: "object",
    properties: {
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
    },
  },
  params: {
    properties: {
      venue_id: { type: "integer" },
    },
    required: ["venue_id"],
  },
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          start_at: { type: "string", format: "date-time" },
          end_at: { type: "string", format: "date-time" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
        required: ["id", "start_at", "end_at", "created_at", "updated_at"],
        additionalProperties: false,
      },
    },
  },
};

module.exports = {
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
};
