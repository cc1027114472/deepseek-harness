//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

var (
	user32Mod         = syscall.NewLazyDLL("user32.dll")
	kernel32Mod       = syscall.NewLazyDLL("kernel32.dll")
	openClipboard     = user32Mod.NewProc("OpenClipboard")
	closeClipboard    = user32Mod.NewProc("CloseClipboard")
	emptyClipboard    = user32Mod.NewProc("EmptyClipboard")
	setClipboardData  = user32Mod.NewProc("SetClipboardData")
	globalAlloc       = kernel32Mod.NewProc("GlobalAlloc")
	globalLock        = kernel32Mod.NewProc("GlobalLock")
	globalUnlock      = kernel32Mod.NewProc("GlobalUnlock")
)

const (
	cfUnicodeText = 13
	gmemMoveable  = 0x0002
)

// SetClipboardText sets UTF-16 text to the Windows system clipboard.
func SetClipboardText(text string) error {
	utf16, err := syscall.UTF16FromString(text)
	if err != nil {
		return err
	}

	r1, _, err := openClipboard.Call(0)
	if r1 == 0 {
		return err
	}
	defer closeClipboard.Call()

	emptyClipboard.Call()

	bytesLen := len(utf16) * 2
	hMem, _, err := globalAlloc.Call(gmemMoveable, uintptr(bytesLen))
	if hMem == 0 {
		return err
	}

	ptr, _, err := globalLock.Call(hMem)
	if ptr == 0 {
		return err
	}

	dest := unsafe.Slice((*byte)(unsafe.Pointer(ptr)), bytesLen)
	src := unsafe.Slice((*byte)(unsafe.Pointer(&utf16[0])), bytesLen)
	copy(dest, src)

	globalUnlock.Call(hMem)
	setClipboardData.Call(uintptr(cfUnicodeText), hMem)
	return nil
}
