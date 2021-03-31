package main

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	jwt "github.com/dgrijalva/jwt-go"
	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

const (
	contextKeyJwt = "jwt"

	roleAudience = "audience"
	roleArtist   = "artist"
	roleOwner    = "owner"

	defaultIconFilePath = "./public/img/default.png"
	mysqlDatetimeFormat = "2006-01-02 15:04:05"
)

var (
	dbx *sqlx.DB
)

/* DB model & request/response */

type reqLogin struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type respLogin struct {
	UserId      int64  `json:"user_id"`
	AccessToken string `json:"access_token"`
}

type reqSignUp struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type User struct {
	Id           int64     `db:"id"`
	Username     string    `db:"username"`
	Role         string    `db:"role"`
	PasswordHash string    `db:"password_hash"`
	Salt         string    `db:"salt"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
}

type respUser struct {
	UserId   int64  `json:"user_id"`
	UserName string `json:"username"`
	Role     string `json:"role"`
}

type Event struct {
	Id           int64          `db:"id"`
	ArtistId     int64          `db:"user_id"`
	VenueId      int64          `db:"venue_id"`
	GenreId      int64          `db:"eventgenre_id"`
	Name         string         `db:"name"`
	StartAt      time.Time      `db:"start_at"`
	EndAt        time.Time      `db:"end_at"`
	Price        int64          `db:"price"`
	EncodedImage sql.NullString `db:"image"`
	CreatedAt    time.Time      `db:"created_at"`
	UpdatedAt    time.Time      `db:"updated_at"`
}

type reqEvent struct {
	Name        string    `json:"event_name"`
	GenreId     int64     `json:"event_genre_id"`
	Price       int64     `json:"price"`
	TimeslotIds []int64   `json:"timeslot_ids"`
	StartAt     time.Time `json:"start_at"`
	EndAt       time.Time `json:"end_at"`
}

type respEvent struct {
	Id             int64     `json:"id"`
	Name           string    `json:"event_name"`
	GenreId        int64     `json:"event_genre_id"`
	ArtistId       int64     `json:"artist_id"`
	ArtistName     string    `json:"artist_name"`
	VenueId        int64     `json:"venue_id"`
	VenueName      string    `json:"venue_name"`
	StartAt        time.Time `json:"start_at"`
	EndAt          time.Time `json:"end_at"`
	Price          int64     `json:"price"`
	TimeslotIds    []int64   `json:"timeslot_ids"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	Capacity       int64     `json:"capacity"`
	CurrentReserve int64     `json:"current_resv"`
}

type Reservation struct {
	Id           int64     `db:"id"`
	UserId       int64     `db:"user_id"`
	EventId      int64     `db:"event_id"`
	NumOfReserve int64     `db:"num_of_resv"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
}

type reqReservation struct {
	NumOfReserve int64 `json:"num_of_resv"`
}

type respReservation struct {
	Id           int64     `json:"id"`
	UserId       int64     `json:"user_id"`
	Username     string    `json:"username"`
	EventId      int64     `json:"event_id"`
	EventName    string    `json:"event_name"`
	EventPrice   int64     `json:"event_price"`
	EventStartAt time.Time `json:"event_start_at"`
	EventEndAt   time.Time `json:"event_end_at"`
	VenueName    string    `json:"venue_name"`
	NumOfReserve int64     `json:"num_of_resv"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Genre struct {
	Id        int64     `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	CreatedAt time.Time `db:"created_at" json:"-"`
	UpdatedAt time.Time `db:"updated_at" json:"-"`
}

type Venue struct {
	Id        int64     `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	Capacity  int64     `db:"capacity" json:"capacity"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

type Timeslot struct {
	Id        int64         `db:"id"`
	VenueId   int64         `db:"venue_id"`
	EventId   sql.NullInt64 `db:"event_id"`
	StartAt   time.Time     `db:"start_at"`
	EndAt     time.Time     `db:"end_at"`
	CreatedAt time.Time     `db:"created_at"`
	UpdatedAt time.Time     `db:"updated_at"`
}

type respTimeslot struct {
	Id        int64     `json:"id"`
	StartAt   time.Time `json:"start_at"`
	EndAt     time.Time `json:"end_at"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type respError struct {
	Message string `json:"message"`
}

/* error types */

type errUnauthorized struct{}

func (e errUnauthorized) Error() string {
	return ""
}

type errBadPayload struct{}

func (e errBadPayload) Error() string {
	return ""
}

/* Handlers */

func postLogin(c echo.Context) error {
	req := reqLogin{}
	if err := c.Bind(&req); err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch exists."})
	}
	if req.Username == "" || req.Password == "" {
		return jsonify(c, http.StatusBadRequest, respError{"Both of username and password are required."})
	}

	user, err := getUserByUsername(dbx, req.Username)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusUnauthorized, respError{"Invalid credentials."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	if !isPasswordCorrect(user, req.Username, req.Password) {
		return jsonify(c, http.StatusUnauthorized, respError{"Invalid credentials."})
	}

	// generate jwt
	now := time.Now()
	payload := jwtPayload{
		Username: user.Username,
		Role:     user.Role,
		Iat:      now.Unix(),
		Exp:      now.Add(time.Hour * 1).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, payload.toMapClaims())
	t, err := token.SignedString([]byte(jwtSecretKey))
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	jsonify(c, http.StatusOK, respLogin{user.Id, t})
	c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationJSON) // 正常性確認用に Content-Type を付け替え
	return nil
}

func postLogout(c echo.Context) error {
	if err := revokeToken(strings.TrimPrefix(c.Request().Header.Get("Authorization"), "Bearer ")); err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	return jsonify(c, http.StatusOK, "")
}

func signUp(c echo.Context) error {
	req := reqSignUp{}
	if err := c.Bind(&req); err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch exists."})
	}
	if req.Username == "" || req.Password == "" {
		return jsonify(c, http.StatusBadRequest, respError{"Mandatory parameter(s) are missing."})
	} else if !(req.Role == roleAudience || req.Role == roleArtist) {
		return jsonify(c, http.StatusBadRequest, respError{"Role is invalid. Choose from 'audience' or 'artist'."})
	}

	if exists, err := userAlreadyExists(dbx, req.Username); err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	} else if exists {
		return jsonify(c, http.StatusConflict, respError{"A user who has same username exists. Consider using different username."})
	}

	salt, err := getSalt()
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	result, err := dbx.Exec(`INSERT INTO users (username, role, password_hash, salt) VALUES (?, ?, ?, ?)`,
		req.Username,
		req.Role,
		getPasswordHash(salt, req.Password),
		salt,
	)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	userId, err := result.LastInsertId()
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	return jsonify(c, http.StatusCreated, respUser{userId, req.Username, req.Role})
}

func getUser(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	userIdStr := c.Param("user_id")
	userId, err := strconv.ParseInt(userIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}

	user, err := getUserById(dbx, userId)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	// authorization
	switch {
	case payload.Role == roleAudience || payload.Role == roleArtist:
		if user.Username != payload.Username {
			return jsonify(c, http.StatusForbidden, respError{"Access declined."})
		}
	case payload.Role == roleOwner:
		// pass
	default:
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	return jsonify(c, http.StatusOK, respUser{user.Id, user.Username, user.Role})
}

func listGenres(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	// authorization
	if !(payload.Role == roleArtist || payload.Role == roleOwner) {
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	genres := []*Genre{}
	if err := dbx.Select(&genres, "SELECT * FROM `eventgenres`"); err != nil {
		if err != sql.ErrNoRows {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
	}

	return jsonify(c, http.StatusOK, genres)
}

func listEvents(c echo.Context) error {
	artistIdStr := c.QueryParam("user_id")
	if artistIdStr == "" {
		artistIdStr = "0"
	}
	artistId, err := strconv.ParseInt(artistIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}

	limit, offset, err := parseLimitOffset(c, c.QueryParam("limit"), c.QueryParam("offset"), 12, 0)
	if err != nil {
		return nil
	}

	query := "SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price, created_at, updated_at FROM `events` WHERE DATE(NOW()) <= start_at"
	if artistId != 0 {
		query += fmt.Sprintf(" AND user_id = %d", artistId)
	}
	query += " LIMIT ? OFFSET ?"

	events := []*Event{}
	if err := dbx.Select(&events, query, limit, offset); err != nil {
		if err != sql.ErrNoRows {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
	}

	var resp []*respEvent
	for _, event := range events {
		e, err := getEventResponse(dbx, event)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		resp = append(resp, e)
	}

	return jsonify(c, http.StatusOK, resp)
}

func createEvent(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	// authorization
	if !(payload.Role == roleArtist) {
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	req := reqEvent{}
	if err := c.Bind(&req); err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}
	if req.Name == "" || req.GenreId == 0 || len(req.TimeslotIds) == 0 || req.Price == 0 {
		return jsonify(c, http.StatusBadRequest, respError{"Mandatory parameter(s) are missing."})
	} else if len(req.TimeslotIds) > 2 {
		return jsonify(c, http.StatusBadRequest, respError{"Restriction violation(s) occur."})
	}

	user, err := getUserByUsername(dbx, payload.Username)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	if _, err := getGenreById(dbx, req.GenreId); err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Specified resource(s) are unavailable."})
	}

	tx := dbx.MustBegin()

	timeslots, err := getTimeslotsByIds(tx, req.TimeslotIds, 0)
	if err != nil {
		tx.Rollback()
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusBadRequest, respError{"Specified resource(s) are unavailable."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	if !validateTimeslot(timeslots, req.StartAt, req.EndAt) {
		tx.Rollback()
		return jsonify(c, http.StatusBadRequest, respError{"Specified resource(s) are unavailable."})
	}
	venueId, err := parseVenueIdByTimeslots(timeslots)
	if err != nil {
		tx.Rollback()
		return jsonify(c, http.StatusBadRequest, respError{"Specified resource(s) are unavailable."})
	}

	result, err := tx.Exec("INSERT INTO `events` (`user_id`, `venue_id`, `eventgenre_id`, `name`, `start_at`, `end_at`, `price`) VALUES (?,?,?,?,?,?,?)",
		user.Id,
		venueId,
		req.GenreId,
		req.Name,
		req.StartAt,
		req.EndAt,
		req.Price,
	)
	if err != nil {
		tx.Rollback()
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	eventId, err := result.LastInsertId()
	if err != nil {
		tx.Rollback()
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	for _, timeslot := range timeslots {
		if result, err := tx.Exec("UPDATE `timeslots` SET `event_id` = ? WHERE `id` = ? AND event_id IS NULL",
			eventId,
			timeslot.Id,
		); err != nil {
			tx.Rollback()
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		} else if affectedNum, err := result.RowsAffected(); err != nil {
			tx.Rollback()
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		} else if affectedNum == 0 {
			tx.Rollback()
			return jsonify(c, http.StatusConflict, respError{"Selected timeslots are already reserved."})
		}
	}

	tx.Commit()

	createdEvent, err := getEventById(dbx, eventId)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	resp, err := getEventResponse(dbx, createdEvent)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	return jsonify(c, http.StatusCreated, resp)
}

func getEvent(c echo.Context) error {
	eventIdStr := c.Param("event_id")
	eventId, err := strconv.ParseInt(eventIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}

	event, err := getEventById(dbx, eventId)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	resp, err := getEventResponse(dbx, event)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	return jsonify(c, http.StatusOK, resp)
}

func updateEvent(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	eventIdStr := c.Param("event_id")
	eventId, err := strconv.ParseInt(eventIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}

	req := reqEvent{}
	if err := c.Bind(&req); err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}
	if req.Name == "" || req.GenreId == 0 || len(req.TimeslotIds) == 0 || req.Price <= 0 {
		return jsonify(c, http.StatusBadRequest, respError{"Mandatory parameter(s) are missing."})
	} else if len(req.TimeslotIds) > 2 {
		return jsonify(c, http.StatusBadRequest, respError{"Restriction violation(s) occur."})
	}

	event, err := getEventById(dbx, eventId)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	user, err := getUserByUsername(dbx, payload.Username)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	switch payload.Role {
	case roleArtist:
		if user.Id != event.ArtistId {
			return jsonify(c, http.StatusForbidden, respError{"Access declined."})
		}
	case roleOwner:
		// pass
	default:
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	tx := dbx.MustBegin()

	if _, err := getGenreById(tx, req.GenreId); err != nil {
		tx.Rollback()
		return jsonify(c, http.StatusBadRequest, respError{"Specified resource(s) are unavailable."})
	}

	timeslots, err := getTimeslotsByIds(tx, req.TimeslotIds, eventId)
	if err != nil {
		tx.Rollback()
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusBadRequest, respError{"Specified resource(s) are unavailable."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	if !validateTimeslot(timeslots, req.StartAt, req.EndAt) {
		tx.Rollback()
		return jsonify(c, http.StatusBadRequest, respError{"Specified resource(s) are unavailable."})
	}
	venueId, err := parseVenueIdByTimeslots(timeslots)
	if err != nil {
		tx.Rollback()
		return jsonify(c, http.StatusBadRequest, respError{"Specified resource(s) are unavailable."})
	}

	if _, err := tx.Exec("UPDATE `events` SET `venue_id` = ?, `eventgenre_id` = ?, `name` = ?, `start_at` = ?, `end_at` = ?, `price` = ? WHERE id = ?",
		venueId,
		req.GenreId,
		req.Name,
		req.StartAt,
		req.EndAt,
		req.Price,
		eventId,
	); err != nil {
		tx.Rollback()
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	if _, err := tx.Exec("UPDATE `timeslots` SET `event_id` = NULL WHERE `event_id` = ?",
		eventId,
	); err != nil {
		tx.Rollback()
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	for _, timeslot := range timeslots {
		if result, err := tx.Exec("UPDATE `timeslots` SET `event_id` = ? WHERE `id` = ? AND event_id IS NULL",
			eventId,
			timeslot.Id,
		); err != nil {
			tx.Rollback()
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		} else if affectedNum, err := result.RowsAffected(); err != nil {
			tx.Rollback()
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		} else if affectedNum == 0 {
			tx.Rollback()
			return jsonify(c, http.StatusConflict, respError{"Selected timeslots are already reserved."})
		}
	}

	tx.Commit()

	updatedEvent, err := getEventById(dbx, eventId)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	resp, err := getEventResponse(dbx, updatedEvent)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	return jsonify(c, http.StatusOK, resp)
}

func getEventImage(c echo.Context) error {
	eventIdStr := c.Param("event_id")
	eventId, err := strconv.ParseInt(eventIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}

	event := Event{}
	if err := dbx.QueryRowx("SELECT image FROM `events` WHERE `id` = ?", eventId).StructScan(&event); err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	if !event.EncodedImage.Valid {
		f, err := os.Open(defaultIconFilePath)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		defer f.Close()
		return c.Stream(http.StatusOK, "image/png", f)
	}
	image, err := base64.StdEncoding.DecodeString(event.EncodedImage.String)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	return c.Blob(http.StatusOK, "image/png", image)
}

func putEventImage(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	eventIdStr := c.Param("event_id")
	eventId, err := strconv.ParseInt(eventIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}
	event, err := getEventById(dbx, eventId)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	// authorization
	switch payload.Role {
	case roleArtist:
		// get User
		user, err := getUserByUsername(dbx, payload.Username)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		if event.ArtistId != user.Id {
			return jsonify(c, http.StatusForbidden, respError{"Access declined."})
		}
	case roleOwner:
		// pass
	default:
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	fp, err := c.FormFile("image")
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Mandatory parameter(s) are missing."})
	}
	file, err := fp.Open()
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	defer file.Close()
	image, err := ioutil.ReadAll(file)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	if http.DetectContentType(image) != "image/png" {
		return jsonify(c, http.StatusBadRequest, respError{"Restriction violation(s) occur."})
	}

	if _, err := dbx.Exec("UPDATE `events` SET `image` = ? WHERE id = ?",
		base64.StdEncoding.EncodeToString([]byte(image)),
		eventId,
	); err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	return c.NoContent(http.StatusNoContent)
}

func listReservationsByUser(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	userIdStr := c.Param("user_id")
	userId, err := strconv.ParseInt(userIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}
	if _, err := getUserById(dbx, userId); err != nil {
		return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
	}

	// authorization
	switch payload.Role {
	case roleAudience:
		user, err := getUserByUsername(dbx, payload.Username)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		if user.Id != userId {
			return jsonify(c, http.StatusForbidden, respError{"Access declined."})
		}
	case roleOwner:
		// pass
	default:
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	limit, offset, err := parseLimitOffset(c, c.QueryParam("limit"), c.QueryParam("offset"), 5, 0)
	if err != nil {
		return nil
	}

	var resp []*respReservation
	rows, err := dbx.Queryx("SELECT * FROM reservations WHERE user_id = ? LIMIT ? OFFSET ?", userId, limit, offset)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	for rows.Next() {
		var reservation Reservation
		rows.StructScan(&reservation)
		r, err := generateReservationResponse(dbx, &reservation)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		resp = append(resp, r)
	}

	return jsonify(c, http.StatusOK, resp)
}

func listReservationsByEvent(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	eventIdStr := c.Param("event_id")
	eventId, err := strconv.ParseInt(eventIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}

	event, err := getEventById(dbx, eventId)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	// authorization
	switch payload.Role {
	case roleArtist:
		user, err := getUserByUsername(dbx, payload.Username)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		if event.ArtistId != user.Id {
			return jsonify(c, http.StatusForbidden, respError{"Access declined."})
		}
	case roleOwner:
		// pass
	default:
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	limit, offset, err := parseLimitOffset(c, c.QueryParam("limit"), c.QueryParam("offset"), 10, 0)
	if err != nil {
		return nil
	}

	var resp []*respReservation
	rows, err := dbx.Queryx("SELECT * FROM reservations WHERE event_id = ? LIMIT ? OFFSET ?", eventId, limit, offset)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	for rows.Next() {
		var reservation Reservation
		if err := rows.StructScan(&reservation); err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		r, err := generateReservationResponse(dbx, &reservation)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		resp = append(resp, r)
	}

	return jsonify(c, http.StatusOK, resp)
}

func createReservation(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	if !(payload.Role == roleAudience) {
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	req := reqReservation{}
	if err := c.Bind(&req); err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch exists."})
	}
	if !(req.NumOfReserve > 0) {
		return jsonify(c, http.StatusBadRequest, respError{"Restriction violation(s) occur."})
	}

	eventIdStr := c.Param("event_id")
	eventId, err := strconv.ParseInt(eventIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}
	event, err := getEventById(dbx, eventId)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	user, err := getUserByUsername(dbx, payload.Username)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	var capacity int64
	if err := dbx.QueryRow(`SELECT capacity FROM venues WHERE id = ?`, event.VenueId).Scan(&capacity); err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	tx := dbx.MustBegin()

	tx.Exec("LOCK TABLE reservations WRITE")
	rows, err := tx.Query("SELECT * FROM `reservations` WHERE event_id = ? AND user_id = ?", eventId, user.Id)
	if err != nil {
		tx.Exec("UNLOCK TABLE")
		tx.Rollback()
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	} else if rows.Next() {
		tx.Exec("UNLOCK TABLE")
		tx.Rollback()
		return jsonify(c, http.StatusConflict, respError{"You've already reserved this event. To change the content, cancel and reserve it again."})
	}

	var totalReserved int64
	var reservations []*Reservation
	if err := tx.Select(&reservations, `SELECT * FROM reservations WHERE event_id = ?`, eventId); err != nil {
		tx.Exec("UNLOCK TABLE")
		tx.Rollback()
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	for _, reservation := range reservations {
		totalReserved += reservation.NumOfReserve
	}
	if req.NumOfReserve+totalReserved > capacity {
		tx.Exec("UNLOCK TABLE")
		tx.Rollback()
		jsonify(c, http.StatusConflict, respError{"Tickets are all gone."})
		return err
	}

	result, err := tx.Exec("INSERT INTO `reservations` (`user_id`, `event_id`, `num_of_resv`) VALUES (?,?,?)",
		user.Id,
		eventId,
		req.NumOfReserve,
	)
	if err != nil {
		tx.Exec("UNLOCK TABLE")
		tx.Rollback()
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	reservationId, err := result.LastInsertId()
	if err != nil {
		tx.Exec("UNLOCK TABLE")
		tx.Rollback()
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	tx.Exec("UNLOCK TABLE")
	tx.Commit()

	reservation, err := getReservationById(dbx, reservationId)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}
	resp, err := generateReservationResponse(dbx, reservation)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	return jsonify(c, http.StatusCreated, resp)
}

func getReservation(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	reservationIdStr := c.Param("reservation_id")
	reservationId, err := strconv.ParseInt(reservationIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}

	reservation, err := getReservationById(dbx, reservationId)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	// authorization
	switch payload.Role {
	case roleAudience:
		user, err := getUserByUsername(dbx, payload.Username)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		if reservation.UserId != user.Id {
			return jsonify(c, http.StatusForbidden, respError{"Access declined."})
		}
	case roleOwner:
		// pass
	default:
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	resp, err := generateReservationResponse(dbx, reservation)
	if err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	return jsonify(c, http.StatusOK, resp)
}

func cancelReservation(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	reservationIdStr := c.Param("reservation_id")
	reservationId, err := strconv.ParseInt(reservationIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
	}

	reservation, err := getReservationById(dbx, reservationId)
	if err != nil {
		if err == sql.ErrNoRows {
			return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
		}
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	// authorization
	switch payload.Role {
	case roleAudience:
		user, err := getUserByUsername(dbx, payload.Username)
		if err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		if reservation.UserId != user.Id {
			return jsonify(c, http.StatusForbidden, respError{"Access declined."})
		}
	case roleOwner:
		// pass
	default:
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	if _, err := dbx.Exec("DELETE FROM `reservations` WHERE `id` = ?", reservationId); err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	return c.NoContent(http.StatusNoContent)
}

func listVenues(c echo.Context) error {
	limit, offset, err := parseLimitOffset(c, c.QueryParam("limit"), c.QueryParam("offset"), 5, 0)
	if err != nil {
		return nil
	}

	venues := []*Venue{}
	if err := dbx.Select(&venues, "SELECT * FROM `venues` LIMIT ? OFFSET ?", limit, offset); err != nil {
		if err != sql.ErrNoRows {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
	}
	return jsonify(c, http.StatusOK, venues)
}

func listTimeslots(c echo.Context) error {
	payload := c.Get(contextKeyJwt).(*jwtPayload)

	venueIdStr := c.Param("venue_id")
	venueId, err := strconv.ParseInt(venueIdStr, 10, 64)
	if err != nil {
		return jsonify(c, http.StatusBadRequest, respError{"venue_id must be integer."})
	}
	if _, err := getVenueById(dbx, venueId); err != nil {
		return jsonify(c, http.StatusNotFound, respError{"Requested resource is not found."})
	}

	if !(payload.Role == roleArtist || payload.Role == roleOwner) {
		return jsonify(c, http.StatusForbidden, respError{"Access declined."})
	}

	query := "SELECT * FROM `timeslots` WHERE venue_id = ? AND event_id IS NULL"
	fromStr := c.QueryParam("from")
	toStr := c.QueryParam("to")
	var from, to time.Time
	if fromStr != "" {
		from, err = time.Parse(time.RFC3339, fromStr)
		if err != nil {
			return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
		}
	} else {
		from = time.Now()
	}
	if toStr != "" {
		to, err = time.Parse(time.RFC3339, toStr)
		if err != nil {
			return jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
		}
	} else {
		now := time.Now()
		to = time.Date(now.Year(), now.Month()+1, 1, 23, 59, 59, 0, time.Local).AddDate(0, 0, -1) // end of this month
	}
	query += fmt.Sprintf(" AND \"%s\" <= `start_at` AND `start_at` <= \"%s\"", from.Format(mysqlDatetimeFormat), to.Format(mysqlDatetimeFormat))

	timeslots := []*Timeslot{}
	if err := dbx.Select(&timeslots, query, venueId); err != nil {
		jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
		return err
	}

	var resp []*respTimeslot
	for _, timeslot := range timeslots {
		resp = append(resp, &respTimeslot{
			Id:        timeslot.Id,
			StartAt:   timeslot.StartAt,
			EndAt:     timeslot.EndAt,
			CreatedAt: timeslot.CreatedAt,
			UpdatedAt: timeslot.UpdatedAt,
		})
	}

	return jsonify(c, http.StatusOK, resp)
}

// Other functions

func parseLimitOffset(c echo.Context, limitStr, offsetStr string, defaultLimit, defaultOffset int64) (int64, int64, error) {
	var limit, offset int64
	var err error

	if limitStr == "" {
		limit = defaultLimit
	} else {
		limit, err = strconv.ParseInt(limitStr, 10, 64)
		if err != nil {
			jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
			return 0, 0, err
		}
	}
	if offsetStr == "" {
		offset = defaultOffset
	} else {
		offset, err = strconv.ParseInt(offsetStr, 10, 64)
		if err != nil {
			jsonify(c, http.StatusBadRequest, respError{"Type mismatch(es) exist."})
			return 0, 0, err
		}
	}
	if limit < 0 || offset < 0 {
		jsonify(c, http.StatusBadRequest, respError{"Restriction violation(s) occur."})
		return 0, 0, fmt.Errorf("limit and offset must be positive number")
	}
	return limit, offset, nil
}

func jsonify(c echo.Context, code int, i interface{}) error {
	c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationJSON) // 正常性確認用に Content-Type を指定
	return c.JSON(code, i)
}

func jwtAuthMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		payload, err := authenticationJwt(c.Request().Header.Get("Authorization"))
		if err != nil {
			switch err.(type) {
			case errBadPayload:
				return jsonify(c, http.StatusBadRequest, respError{"Mandatory parameter(s) are missing."})
			case errUnauthorized:
				return jsonify(c, http.StatusUnauthorized, respError{"Invalid credentials."})
			default:
				jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
				return err
			}
		}
		c.Set(contextKeyJwt, payload)
		return next(c)
	}
}

/* main */

func main() {
	host := os.Getenv("MYSQL_HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	port := os.Getenv("MYSQL_PORT")
	if port == "" {
		port = "3306"
	}
	_, err := strconv.Atoi(port)
	if err != nil {
		log.Fatalf("failed to read DB port number from an environment variable MYSQL_PORT.\nError: %s", err.Error())
	}
	user := os.Getenv("MYSQL_USER")
	if user == "" {
		user = "isucon"
	}
	password := os.Getenv("MYSQL_PASSWORD")
	dbname := os.Getenv("MYSQL_DATABASE")
	if dbname == "" {
		dbname = "isucari"
	}

	dbx, err = sqlx.Open("mysql", fmt.Sprintf(
		"%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=true&loc=Local",
		user,
		password,
		host,
		port,
		dbname,
	))
	if err != nil {
		log.Fatalf("failed to connect to DB: %s.", err.Error())
	}
	defer dbx.Close()

	jwtSecretKey = os.Getenv("JWT_SECRET_KEY")
	jwtRevocationListFilePath = os.Getenv("REVOCATION_LIST_PATH")
	if jwtRevocationListFilePath == "" {
		jwtRevocationListFilePath = "./TokenRevocationList.dat"
	}

	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	/* Routes */
	api := e.Group("/api")
	// users
	api.POST("/login", postLogin)
	api.POST("/logout", postLogout, jwtAuthMiddleware)
	api.POST("/users", signUp)
	api.GET("/users/:user_id", getUser, jwtAuthMiddleware)
	// events
	api.GET("/genres", listGenres, jwtAuthMiddleware)
	api.GET("/events", listEvents)
	api.POST("/events", createEvent, jwtAuthMiddleware)
	api.GET("/events/:event_id", getEvent)
	api.PUT("/events/:event_id", updateEvent, jwtAuthMiddleware)
	api.GET("/events/:event_id/image", getEventImage)
	api.PUT("/events/:event_id/image", putEventImage, jwtAuthMiddleware)
	// reservations
	api.GET("/users/:user_id/reservations", listReservationsByUser, jwtAuthMiddleware)
	api.GET("/events/:event_id/reservations", listReservationsByEvent, jwtAuthMiddleware)
	api.POST("/events/:event_id/reservations", createReservation, jwtAuthMiddleware)
	api.GET("/reservations/:reservation_id", getReservation, jwtAuthMiddleware)
	api.DELETE("/reservations/:reservation_id", cancelReservation, jwtAuthMiddleware)
	// venues
	api.GET("/venues", listVenues, jwtAuthMiddleware)
	api.GET("/venues/:venue_id/timeslots", listTimeslots, jwtAuthMiddleware)
	// initialize
	api.POST("/initialize", func(c echo.Context) error {
		if err := exec.Command("bash", "scripts/init.sh").Run(); err != nil {
			jsonify(c, http.StatusInternalServerError, respError{"Internal server error."})
			return err
		}
		// 販促実施に応じて，ここの値を変更してください
		// 詳しくは，specを参照してください．
		// https://portal.ptc.ntt.dev/spec.html#tag/other
		return c.String(http.StatusOK, "1")  // 数値を string で第2引数に指定
	})
	// public
	e.Static("/", "public")

	if err := http.ListenAndServe(":5000", e); err != nil {
		log.Fatal(err)
	}
}
