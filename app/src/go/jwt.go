package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"sync"

	jwt "github.com/dgrijalva/jwt-go"
)

const (
	claimKeyUsername = `username`
	claimKeyRole     = `role`
	claimKeyIat      = `iat`
	claimKeyExp      = `exp`
)

var (
	jwtSecretKey              string
	jwtRevocationListFilePath string
	muForFile                 sync.Mutex
)

type jwtPayload struct {
	Username string
	Role     string
	Iat      int64
	Exp      int64
}

func newJwtPayload(claims jwt.MapClaims) (*jwtPayload, error) {
	username, ok := claims[claimKeyUsername].(string)
	if !ok {
		return nil, fmt.Errorf(`invalid jwt payload`)
	}
	role, ok := claims[claimKeyRole].(string)
	if !ok {
		return nil, fmt.Errorf(`invalid jwt payload`)
	}
	iat, ok := claims[claimKeyIat].(float64)
	if !ok {
		return nil, fmt.Errorf(`invalid jwt payload`)
	}
	exp, ok := claims[claimKeyExp].(float64)
	if !ok {
		return nil, fmt.Errorf(`invalid jwt payload`)
	}

	return &jwtPayload{username, role, int64(iat), int64(exp)}, nil
}

func (p jwtPayload) toMapClaims() jwt.MapClaims {
	return jwt.MapClaims{
		claimKeyUsername: p.Username,
		claimKeyRole:     p.Role,
		claimKeyIat:      p.Iat,
		claimKeyExp:      p.Exp,
	}
}

func authenticationJwt(headerAuthorization string) (*jwtPayload, error) {
	// get JWT
	reqJwt := strings.TrimPrefix(headerAuthorization, "Bearer ")

	// verify JWT
	token, err := jwt.Parse(reqJwt, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("Unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(jwtSecretKey), nil
	})
	if err != nil {
		return nil, errUnauthorized{}
	}

	// if already logged out
	f, err := os.OpenFile(jwtRevocationListFilePath, os.O_RDONLY|os.O_CREATE, 0644)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if exist := func() bool {
		muForFile.Lock()
		defer muForFile.Unlock()

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			if reqJwt == scanner.Text() {
				return true
			}
		}
		return false
	}(); exist {
		return nil, errUnauthorized{}
	}

	// get JwtPayload
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errBadPayload{}
	}
	payload, err := newJwtPayload(claims)
	if err != nil {
		return nil, errBadPayload{}
	}

	return payload, nil
}

func revokeToken(jwt string) error {
	f, err := os.OpenFile(jwtRevocationListFilePath, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	func() {
		muForFile.Lock()
		defer muForFile.Unlock()
		fmt.Fprintln(f, jwt)
	}()

	return nil
}
