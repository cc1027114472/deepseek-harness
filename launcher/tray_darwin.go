//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

// TrayManager for non-Windows platforms (console / signal based).
type TrayManager struct {
	onOpen      func()
	onCopyURL   func()
	onRestart   func()
	onExit      func()
	serviceURL  string
}

func InitTray(serviceURL string, onOpen, onCopyURL, onRestart, onExit func()) (*TrayManager, error) {
	fmt.Printf("[Mowan Harness] Running in background: %s\n", serviceURL)
	return &TrayManager{
		onOpen:     onOpen,
		onCopyURL:  onCopyURL,
		onRestart:  onRestart,
		onExit:     onExit,
		serviceURL: serviceURL,
	}, nil
}

func (t *TrayManager) ShowToast(title, message string) {
	fmt.Printf("[%s] %s\n", title, message)
}

func (t *TrayManager) Close() {}

func (t *TrayManager) RunMessageLoop() {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan
	if t.onExit != nil {
		t.onExit()
	}
}
