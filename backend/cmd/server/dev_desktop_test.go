package main

import (
	"infinite-canvas/backend/internal/bootstrap"
	"path/filepath"
	"testing"
)

func TestDevelopmentProfile(t *testing.T) {
	dir := t.TempDir()
	session := filepath.Join(dir, "dev-session.json")
	for _, tc := range []struct {
		name, file, addr string
		want             bootstrap.Profile
		fails            bool
	}{
		{"server unchanged", "", ":18080", bootstrap.ProfileServer, false},
		{"loopback", session, "127.0.0.1:18080", bootstrap.ProfileDesktop, false},
		{"ipv6", session, "[::1]:18080", bootstrap.ProfileDesktop, false},
		{"public denied", session, "0.0.0.0:18080", "", true},
		{"outside denied", filepath.Join(dir, "other.json"), "127.0.0.1:18080", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := developmentProfile(tc.file, tc.addr, dir)
			if (err != nil) != tc.fails || got != tc.want {
				t.Fatalf("profile=%q error=%v", got, err)
			}
		})
	}
}
