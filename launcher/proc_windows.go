//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func setHideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}

// registerURLScheme registers a custom URL scheme (e.g., mowan://) in current user registry
func registerURLScheme(scheme string) {
	exePath, err := os.Executable()
	if err != nil {
		return
	}
	exePath, _ = filepath.Abs(exePath)

	baseKey := fmt.Sprintf(`HKCU\Software\Classes\%s`, scheme)
	cmdKey := fmt.Sprintf(`%s\shell\open\command`, baseKey)
	cmdValue := fmt.Sprintf(`"%s" "%%1"`, exePath)

	cmd1 := exec.Command("reg", "add", baseKey, "/ve", "/d", fmt.Sprintf("URL:%s Protocol", scheme), "/f")
	setHideWindow(cmd1)
	_ = cmd1.Run()

	cmd2 := exec.Command("reg", "add", baseKey, "/v", "URL Protocol", "/d", "", "/f")
	setHideWindow(cmd2)
	_ = cmd2.Run()

	cmd3 := exec.Command("reg", "add", cmdKey, "/ve", "/d", cmdValue, "/f")
	setHideWindow(cmd3)
	_ = cmd3.Run()
}
