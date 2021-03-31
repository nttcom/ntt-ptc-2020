package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"sort"
	"time"

	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/sha3"
)

func isPasswordCorrect(user *User, username, password string) bool {
	hashedPassword := getPasswordHash(user.Salt, password)
	if hashedPassword != user.PasswordHash {
		return false
	}
	return true
}

func getSalt() (string, error) {
	bytes := make([]byte, 64)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func getPasswordHash(salt, password string) string {
	result := password + salt
	for i := 0; i < 100; i++ {
		h := sha3.Sum512([]byte(result))
		result = hex.EncodeToString(h[:])
	}
	return result
}

func userAlreadyExists(dbx sqlx.Queryer, username string) (bool, error) {
	if _, err := getUserByUsername(dbx, username); err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func validateTimeslot(timeslots []*Timeslot, eventStartAt, eventEndAt time.Time) bool {
	// event.start_at < event.end_at であること
	if !eventEndAt.After(eventStartAt) {
		return false
	}

	// timeslots を昇順に sort し、時間が連続していること
	sort.SliceStable(timeslots, func(i, j int) bool { return timeslots[j].StartAt.After(timeslots[i].StartAt) })
	for i := 1; i < len(timeslots); i++ {
		if timeslots[i-1].EndAt.Add(1*time.Second) != timeslots[i].StartAt {
			return false
		}
	}

	// timeslots が全て同日であること
	headYear, headMonth, headDay := timeslots[0].StartAt.Date()
	tailYear, tailMonth, tailDay := timeslots[len(timeslots)-1].EndAt.Date()
	if !(headYear == tailYear && headMonth == tailMonth && headDay == tailDay) {
		return false
	}

	// timeslots のなかに eventStartAt ~ eventEndAt が含まれること
	if !(timeslots[0].StartAt.Unix() <= eventStartAt.Unix() && eventEndAt.Unix() <= timeslots[len(timeslots)-1].EndAt.Unix()) {
		return false
	}

	return true
}

func parseVenueIdByTimeslots(timeslots []*Timeslot) (int64, error) {
	venueId := timeslots[0].VenueId
	for _, timeslot := range timeslots {
		if timeslot.VenueId != venueId {
			return 0, fmt.Errorf("timeslots' venueId do not match")
		}
	}
	return venueId, nil
}

func getEventResponse(db sqlx.Queryer, event *Event) (*respEvent, error) {
	artist, err := getUserById(db, event.ArtistId)
	if err != nil {
		return nil, err
	}

	venue, err := getVenueById(db, event.VenueId)
	if err != nil {
		return nil, err
	}

	var reservations []*Reservation
	var currentReserve int64
	rowsResv, err := db.Queryx("SELECT * FROM `reservations` WHERE event_id = ?", event.Id)
	if err != nil {
		return nil, err
	}
	for rowsResv.Next() {
		var reservation Reservation
		if err := rowsResv.StructScan(&reservation); err != nil {
			return nil, err
		}
		reservations = append(reservations, &reservation)
		currentReserve += reservation.NumOfReserve
	}

	var timeslotIds []int64
	rowsTs, err := db.Queryx("SELECT id FROM `timeslots` WHERE event_id = ?", event.Id)
	if err != nil {
		return nil, err
	}
	for rowsTs.Next() {
		var timeslotId int64
		if err = rowsTs.Scan(&timeslotId); err != nil {
			return nil, err
		}
		timeslotIds = append(timeslotIds, timeslotId)
	}

	return &respEvent{
		Id:             event.Id,
		Name:           event.Name,
		GenreId:        event.GenreId,
		ArtistId:       event.ArtistId,
		ArtistName:     artist.Username,
		VenueId:        event.VenueId,
		VenueName:      venue.Name,
		StartAt:        event.StartAt,
		EndAt:          event.EndAt,
		Price:          event.Price,
		TimeslotIds:    timeslotIds,
		CreatedAt:      event.CreatedAt,
		UpdatedAt:      event.UpdatedAt,
		Capacity:       venue.Capacity,
		CurrentReserve: currentReserve,
	}, nil
}

func generateReservationResponse(db sqlx.Queryer, reservation *Reservation) (*respReservation, error) {
	user, err := getUserById(db, reservation.UserId)
	if err != nil {
		return nil, err
	}

	event, err := getEventById(db, reservation.EventId)
	if err != nil {
		return nil, err
	}

	venue, err := getVenueById(db, event.VenueId)
	if err != nil {
		return nil, err
	}

	return &respReservation{
		Id:           reservation.Id,
		UserId:       reservation.UserId,
		Username:     user.Username,
		EventId:      reservation.EventId,
		EventName:    event.Name,
		EventPrice:   event.Price,
		EventStartAt: event.StartAt,
		EventEndAt:   event.EndAt,
		VenueName:    venue.Name,
		NumOfReserve: reservation.NumOfReserve,
		CreatedAt:    reservation.CreatedAt,
		UpdatedAt:    reservation.UpdatedAt,
	}, nil
}

func getUserById(db sqlx.Queryer, id int64) (*User, error) {
	user := User{}
	if err := db.QueryRowx("SELECT * FROM `users` WHERE `id` = ?", id).StructScan(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

func getUserByUsername(db sqlx.Queryer, username string) (*User, error) {
	user := User{}
	if err := db.QueryRowx("SELECT * FROM `users` WHERE `username` = ?", username).StructScan(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

func getEventById(db sqlx.Queryer, id int64) (*Event, error) {
	event := Event{}
	if err := db.QueryRowx("SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price, created_at, updated_at FROM `events` WHERE `id` = ?", id).StructScan(&event); err != nil {
		return nil, err
	}
	return &event, nil
}

func getGenreById(db sqlx.Queryer, id int64) (*Genre, error) {
	genre := Genre{}
	if err := db.QueryRowx("SELECT * FROM `eventgenres` WHERE `id` = ?", id).StructScan(&genre); err != nil {
		return nil, err
	}
	return &genre, nil
}

func getVenueById(db sqlx.Queryer, id int64) (*Venue, error) {
	venue := Venue{}
	if err := db.QueryRowx("SELECT * FROM `venues` WHERE `id` = ?", id).StructScan(&venue); err != nil {
		return nil, err
	}
	return &venue, nil
}

func getReservationById(db sqlx.Queryer, id int64) (*Reservation, error) {
	reservation := Reservation{}
	if err := db.QueryRowx("SELECT * FROM `reservations` WHERE id = ?", id).StructScan(&reservation); err != nil {
		return nil, err
	}
	return &reservation, nil
}

func getReservationByIdAndEventId(db sqlx.Queryer, id, eventId int64) (*Reservation, error) {
	reservation := Reservation{}
	if err := db.QueryRowx("SELECT * FROM `reservations` WHERE id = ? AND event_id = ?", id, eventId).StructScan(&reservation); err != nil {
		return nil, err
	}
	return &reservation, nil
}

func getTimeslotsByIds(dbx sqlx.Queryer, ids []int64, eventId int64) ([]*Timeslot, error) {
	var timeslots []*Timeslot
	for _, timeslotId := range ids {
		timeslot := Timeslot{}
		if err := dbx.QueryRowx("SELECT * FROM `timeslots` WHERE id = ? FOR UPDATE", timeslotId).StructScan(&timeslot); err != nil {
			return nil, err
		}
		timeslots = append(timeslots, &timeslot)
	}
	return timeslots, nil
}
