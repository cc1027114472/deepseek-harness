//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	shell32Mod             = syscall.NewLazyDLL("shell32.dll")
	shellNotifyIcon         = shell32Mod.NewProc("Shell_NotifyIconW")
	extractIcon             = shell32Mod.NewProc("ExtractIconW")
	registerClassEx         = user32Mod.NewProc("RegisterClassExW")
	createWindowEx          = user32Mod.NewProc("CreateWindowExW")
	defWindowProc           = user32Mod.NewProc("DefWindowProcW")
	getMessage              = user32Mod.NewProc("GetMessageW")
	translateMessage        = user32Mod.NewProc("TranslateMessage")
	dispatchMessage         = user32Mod.NewProc("DispatchMessageW")
	postQuitMessage         = user32Mod.NewProc("PostQuitMessage")
	createPopupMenu         = user32Mod.NewProc("CreatePopupMenu")
	appendMenu              = user32Mod.NewProc("AppendMenuW")
	trackPopupMenuEx        = user32Mod.NewProc("TrackPopupMenuEx")
	destroyMenu             = user32Mod.NewProc("DestroyMenu")
	getCursorPos            = user32Mod.NewProc("GetCursorPos")
	setForegroundWindow     = user32Mod.NewProc("SetForegroundWindow")
	postMessage             = user32Mod.NewProc("PostMessageW")
	messageBox              = user32Mod.NewProc("MessageBoxW")
	loadIcon                = user32Mod.NewProc("LoadIconW")
)

const (
	wmApp            = 0x8000
	wmTrayIcon       = wmApp + 1
	wmCommand        = 0x0111
	wmLButtonDblClk  = 0x0203
	wmRButtonUp      = 0x0205
	wmDestroy        = 0x0002

	nimAdd    = 0x00000000
	nimModify = 0x00000001
	nimDelete = 0x00000002

	nifMessage = 0x00000001
	nifIcon    = 0x00000002
	nifTip     = 0x00000004

	mfString    = 0x00000000
	mfSeparator = 0x00000800
	mfDisabled  = 0x00000002

	tpmRightButton = 0x0002
	tpmReturnCmd   = 0x0100

	idiApplication = 32512

	cmdOpenBrowser    = 1001
	cmdCopyTunnelUrl  = 1002
	cmdRestartService = 1003
	cmdExit           = 1004
)

type notifyIconData struct {
	cbSize           uint32
	hWnd             uintptr
	uID              uint32
	uFlags           uint32
	uCallbackMessage uint32
	hIcon            uintptr
	szTip            [128]uint16
}

type point struct {
	x int32
	y int32
}

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
}

// TrayManager manages the Windows system tray lifecycle.
type TrayManager struct {
	hwnd        uintptr
	nid         notifyIconData
	onOpen      func()
	onCopyURL   func()
	onRestart   func()
	onExit      func()
	serviceURL  string
}

var globalTray *TrayManager

func windowProc(hwnd uintptr, uMsg uint32, wParam uintptr, lParam uintptr) uintptr {
	if globalTray == nil {
		r, _, _ := defWindowProc.Call(hwnd, uintptr(uMsg), wParam, lParam)
		return r
	}

	switch uMsg {
	case wmtrayCallback(uMsg):
		switch lParam {
		case wmLButtonDblClk:
			if globalTray.onOpen != nil {
				globalTray.onOpen()
			}
		case wmRButtonUp:
			globalTray.showMenu()
		}
		return 0
	case wmDestroy:
		postQuitMessage.Call(0)
		return 0
	}

	r, _, _ := defWindowProc.Call(hwnd, uintptr(uMsg), wParam, lParam)
	return r
}

func wmtrayCallback(uMsg uint32) uint32 {
	return wmTrayIcon
}

// InitTray initializes the Windows system tray icon and message loop.
func InitTray(serviceURL string, onOpen, onCopyURL, onRestart, onExit func()) (*TrayManager, error) {
	className, _ := syscall.UTF16PtrFromString("MowanAgentTrayClass")
	wndName, _ := syscall.UTF16PtrFromString("MowanAgentTray")

	hIcon, _, _ := loadIcon.Call(0, uintptr(idiApplication))

	wcls := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		lpfnWndProc:   syscall.NewCallback(windowProc),
		lpszClassName: className,
		hIcon:         hIcon,
	}

	r, _, err := registerClassEx.Call(uintptr(unsafe.Pointer(&wcls)))
	if r == 0 {
		return nil, fmt.Errorf("registerClassEx failed: %v", err)
	}

	hwnd, _, err := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(wndName)),
		0,
		0, 0, 0, 0,
		0, 0, 0, 0,
	)
	if hwnd == 0 {
		return nil, fmt.Errorf("createWindowEx failed: %v", err)
	}

	nid := notifyIconData{
		cbSize:           uint32(unsafe.Sizeof(notifyIconData{})),
		hWnd:             hwnd,
		uID:              1,
		uFlags:           nifMessage | nifIcon | nifTip,
		uCallbackMessage: wmTrayIcon,
		hIcon:            hIcon,
	}

	tipStr := "魔丸 (运行中: " + serviceURL + ")"
	if len(tipStr) > 120 {
		tipStr = tipStr[:120]
	}
	tipU16, _ := syscall.UTF16FromString(tipStr)
	copy(nid.szTip[:], tipU16)

	shellNotifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&nid)))

	tray := &TrayManager{
		hwnd:       hwnd,
		nid:        nid,
		onOpen:     onOpen,
		onCopyURL:  onCopyURL,
		onRestart:  onRestart,
		onExit:     onExit,
		serviceURL: serviceURL,
	}
	globalTray = tray

	return tray, nil
}

func (t *TrayManager) showMenu() {
	hMenu, _, _ := createPopupMenu.Call()
	if hMenu == 0 {
		return
	}
	defer destroyMenu.Call(hMenu)

	titleStr, _ := syscall.UTF16PtrFromString("魔丸 (" + t.serviceURL + ")")
	appendMenu.Call(hMenu, mfString|mfDisabled, 0, uintptr(unsafe.Pointer(titleStr)))
	appendMenu.Call(hMenu, mfSeparator, 0, 0)

	openStr, _ := syscall.UTF16PtrFromString("打开 Web 控制台 (Open in Browser)")
	appendMenu.Call(hMenu, mfString, cmdOpenBrowser, uintptr(unsafe.Pointer(openStr)))

	tunnelStr, _ := syscall.UTF16PtrFromString("复制公网访问地址 (Copy Remote URL)")
	appendMenu.Call(hMenu, mfString, cmdCopyTunnelUrl, uintptr(unsafe.Pointer(tunnelStr)))

	appendMenu.Call(hMenu, mfSeparator, 0, 0)

	restartStr, _ := syscall.UTF16PtrFromString("重启本地服务 (Restart Service)")
	appendMenu.Call(hMenu, mfString, cmdRestartService, uintptr(unsafe.Pointer(restartStr)))

	exitStr, _ := syscall.UTF16PtrFromString("退出 (Exit)")
	appendMenu.Call(hMenu, mfString, cmdExit, uintptr(unsafe.Pointer(exitStr)))

	var pt point
	getCursorPos.Call(uintptr(unsafe.Pointer(&pt)))

	setForegroundWindow.Call(t.hwnd)

	cmd, _, _ := trackPopupMenuEx.Call(
		hMenu,
		tpmRightButton|tpmReturnCmd,
		uintptr(pt.x),
		uintptr(pt.y),
		t.hwnd,
		0,
	)

	switch cmd {
	case cmdOpenBrowser:
		if t.onOpen != nil {
			t.onOpen()
		}
	case cmdCopyTunnelUrl:
		if t.onCopyURL != nil {
			t.onCopyURL()
		}
	case cmdRestartService:
		if t.onRestart != nil {
			t.onRestart()
		}
	case cmdExit:
		if t.onExit != nil {
			t.onExit()
		}
	}
}

// ShowToast shows a quick Windows MessageBox info.
func (t *TrayManager) ShowToast(title, message string) {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	msgPtr, _ := syscall.UTF16PtrFromString(message)
	messageBox.Call(t.hwnd, uintptr(unsafe.Pointer(msgPtr)), uintptr(unsafe.Pointer(titlePtr)), 0x00000040)
}

// Close removes the icon from the system tray.
func (t *TrayManager) Close() {
	shellNotifyIcon.Call(nimDelete, uintptr(unsafe.Pointer(&t.nid)))
}

// RunMessageLoop starts the Windows event loop (blocks until exit).
func (t *TrayManager) RunMessageLoop() {
	var m msg
	for {
		r, _, _ := getMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 || int32(r) == -1 {
			break
		}
		translateMessage.Call(uintptr(unsafe.Pointer(&m)))
		dispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
	t.Close()
}
