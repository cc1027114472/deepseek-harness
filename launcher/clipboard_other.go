//go:build !windows

package main

// SetClipboardText stub for non-windows platforms.
func SetClipboardText(text string) error {
	return nil
}
