package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"

	"infinite-canvas/backend/internal/bootstrap"
)

// Development uses the same desktop trust boundary, with secrets passed only
// to the loopback Vite proxy through a private, short-lived file.
func developmentProfile(sessionFile, listenAddr, dataDir string) (bootstrap.Profile, error) {
	if sessionFile == "" {
		return bootstrap.ProfileServer, nil
	}
	host, _, err := net.SplitHostPort(listenAddr)
	if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
		return "", fmt.Errorf("desktop development requires a loopback listen address")
	}
	want, err := filepath.Abs(filepath.Join(dataDir, "dev-session.json"))
	if err != nil {
		return "", err
	}
	actual, err := filepath.Abs(sessionFile)
	if err != nil {
		return "", err
	}
	if actual != want {
		return "", fmt.Errorf("development session must be stored in the workspace data directory")
	}
	return bootstrap.ProfileDesktop, nil
}

func writeDevelopmentSession(path string, runtime *bootstrap.Runtime) error {
	data, err := json.Marshal(map[string]string{
		"baseURL":          runtime.BaseURL(),
		"launchToken":      runtime.LaunchToken(),
		"uiBootstrapToken": runtime.UIBootstrapToken(),
	})
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
