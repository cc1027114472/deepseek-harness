package main

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32Mod            = syscall.NewLazyDLL("user32.dll")
	comctl32Mod          = syscall.NewLazyDLL("comctl32.dll")
	gdi32Mod             = syscall.NewLazyDLL("gdi32.dll")
	shell32Mod           = syscall.NewLazyDLL("shell32.dll")
	modOle32             = syscall.NewLazyDLL("ole32.dll")
	messageBox               = user32Mod.NewProc("MessageBoxW")
	registerClassEx          = user32Mod.NewProc("RegisterClassExW")
	createWindowEx           = user32Mod.NewProc("CreateWindowExW")
	showWindow               = user32Mod.NewProc("ShowWindow")
	updateWindow             = user32Mod.NewProc("UpdateWindow")
	setWindowText            = user32Mod.NewProc("SetWindowTextW")
	getWindowText            = user32Mod.NewProc("GetWindowTextW")
	setWindowPos             = user32Mod.NewProc("SetWindowPos")
	sendMessage              = user32Mod.NewProc("SendMessageW")
	peekMessage              = user32Mod.NewProc("PeekMessageW")
	translateMessage         = user32Mod.NewProc("TranslateMessage")
	dispatchMessage          = user32Mod.NewProc("DispatchMessageW")
	defWindowProc            = user32Mod.NewProc("DefWindowProcW")
	destroyWindow            = user32Mod.NewProc("DestroyWindow")
	getSystemMetrics         = user32Mod.NewProc("GetSystemMetrics")
	initCommonControlsEx     = comctl32Mod.NewProc("InitCommonControlsEx")
	getStockObject           = gdi32Mod.NewProc("GetStockObject")
	procCoInitialize         = modOle32.NewProc("CoInitialize")
	procCoUninitialize       = modOle32.NewProc("CoUninitialize")
	procCoCreateInstance     = modOle32.NewProc("CoCreateInstance")
	procCoTaskMemFree        = modOle32.NewProc("CoTaskMemFree")
	procSHGetFolderPathW     = shell32Mod.NewProc("SHGetFolderPathW")
	procSHBrowseForFolderW   = shell32Mod.NewProc("SHBrowseForFolderW")
	procSHGetPathFromIDListW = shell32Mod.NewProc("SHGetPathFromIDListW")
)

const (
	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	wsChild            = 0x40000000
	wsBorder           = 0x00800000
	wsTabStop          = 0x00010000
	esAutoHScroll      = 0x0080
	bsPushButton       = 0x00000000
	bsDefPushBtn       = 0x00000001
	swHide             = 0
	swShow             = 5
	pbmSetRange32      = 0x0406
	pbmSetPos          = 0x0402
	pbsSmooth          = 0x01
	wmSetFont          = 0x0030
	defaultGuiFont     = 17
	smCxScreen         = 0
	smCyScreen         = 1

	idEditPath   = 101
	idBtnBrowse  = 102
	idBtnInstall = 103
	idBtnCancel  = 104
)

type initControlsPayload struct {
	dwSize uint32
	dwICC  uint32
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
	pt      struct{ x, y int32 }
}

func showMessage(title, text string, flags uintptr) uintptr {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	textPtr, _ := syscall.UTF16PtrFromString(text)
	r, _, _ := messageBox.Call(0, uintptr(unsafe.Pointer(textPtr)), uintptr(unsafe.Pointer(titlePtr)), flags)
	return r
}

func getInstallDir() string {
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		userProfile := os.Getenv("USERPROFILE")
		localAppData = filepath.Join(userProfile, "AppData", "Local")
	}
	return filepath.Join(localAppData, "Programs", "Mowan-Agent")
}

func killOldInstances(installDir string) {
	killCmd := func(name string) {
		cmd := exec.Command("taskkill", "/F", "/IM", name, "/T")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		_ = cmd.Run()
	}
	killCmd("Mowan-Agent.exe")
	killCmd("Mowan-Harness.exe")

	if installDir != "" {
		normDir := filepath.Clean(installDir)
		psCmd := fmt.Sprintf(`Get-Process | Where-Object { $_.Path -and ($_.Path -like '%s*') } | Stop-Process -Force`, strings.ReplaceAll(normDir, `'`, `''`))
		cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psCmd)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		_ = cmd.Run()
	}

	time.Sleep(300 * time.Millisecond)
}

type COMGUID struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

var (
	clsidShellLink = COMGUID{0x00021401, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidShellLinkW  = COMGUID{0x000214F9, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidPersistFile = COMGUID{0x0000010b, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
)

func createNativeShortcut(dstLnk, targetPath, workDir, iconPath, description string) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	procCoInitialize.Call(0)
	defer procCoUninitialize.Call()

	var pUnk uintptr
	hr, _, _ := procCoCreateInstance.Call(
		uintptr(unsafe.Pointer(&clsidShellLink)),
		0,
		1, // CLSCTX_INPROC_SERVER
		uintptr(unsafe.Pointer(&iidShellLinkW)),
		uintptr(unsafe.Pointer(&pUnk)),
	)
	if hr != 0 {
		return fmt.Errorf("CoCreateInstance failed: 0x%x", hr)
	}

	shellLink := (**uintptr)(unsafe.Pointer(pUnk))
	vtable := *shellLink

	callVtable := func(idx int, args ...uintptr) uintptr {
		fn := *(*uintptr)(unsafe.Pointer(uintptr(unsafe.Pointer(vtable)) + uintptr(idx*int(unsafe.Sizeof(uintptr(0))))))
		fullArgs := append([]uintptr{pUnk}, args...)
		res, _, _ := syscall.SyscallN(fn, fullArgs...)
		return res
	}

	pTarget, _ := syscall.UTF16PtrFromString(targetPath)
	callVtable(20, uintptr(unsafe.Pointer(pTarget))) // SetPath

	if workDir != "" {
		pDir, _ := syscall.UTF16PtrFromString(workDir)
		callVtable(9, uintptr(unsafe.Pointer(pDir))) // SetWorkingDirectory
	}
	if description != "" {
		pDesc, _ := syscall.UTF16PtrFromString(description)
		callVtable(7, uintptr(unsafe.Pointer(pDesc))) // SetDescription
	}
	if iconPath != "" {
		pIcon, _ := syscall.UTF16PtrFromString(iconPath)
		callVtable(17, uintptr(unsafe.Pointer(pIcon)), 0) // SetIconLocation
	}

	var pPersist uintptr
	hrQuery := callVtable(0, uintptr(unsafe.Pointer(&iidPersistFile)), uintptr(unsafe.Pointer(&pPersist)))
	if hrQuery != 0 {
		callVtable(2) // Release
		return fmt.Errorf("QueryInterface IPersistFile failed: 0x%x", hrQuery)
	}

	persistFile := (**uintptr)(unsafe.Pointer(pPersist))
	persistVtable := *persistFile

	callPersist := func(idx int, args ...uintptr) uintptr {
		fn := *(*uintptr)(unsafe.Pointer(uintptr(unsafe.Pointer(persistVtable)) + uintptr(idx*int(unsafe.Sizeof(uintptr(0))))))
		fullArgs := append([]uintptr{pPersist}, args...)
		res, _, _ := syscall.SyscallN(fn, fullArgs...)
		return res
	}

	pDst, _ := syscall.UTF16PtrFromString(dstLnk)
	hrSave := callPersist(6, uintptr(unsafe.Pointer(pDst)), 1) // IPersistFile::Save

	callPersist(2) // Release IPersistFile
	callVtable(2)  // Release IShellLink

	if hrSave != 0 {
		return fmt.Errorf("IPersistFile Save failed: 0x%x", hrSave)
	}
	return nil
}

func getWinFolderPath(csidl int) (string, error) {
	buf := make([]uint16, 260)
	r, _, _ := procSHGetFolderPathW.Call(0, uintptr(csidl), 0, 0, uintptr(unsafe.Pointer(&buf[0])))
	if r != 0 {
		return "", fmt.Errorf("SHGetFolderPathW error: 0x%x", r)
	}
	return syscall.UTF16ToString(buf), nil
}

func createAllShortcuts(installDir string) error {
	appExe := filepath.Join(installDir, "Mowan-Agent.exe")
	icoPath := filepath.Join(installDir, "mowan.ico")
	iconTarget := appExe
	if _, err := os.Stat(icoPath); err == nil {
		iconTarget = icoPath
	}

	// 1. Desktop shortcut
	desktop, err := getWinFolderPath(0x0010) // CSIDL_DESKTOPDIRECTORY
	if err == nil && desktop != "" {
		deskLnk := filepath.Join(desktop, "魔丸.lnk")
		_ = createNativeShortcut(deskLnk, appExe, installDir, iconTarget, "魔丸 AI 智能助手 (Mowan Agent)")
	}

	// 2. Start Menu Programs shortcut
	programs, err := getWinFolderPath(0x0002) // CSIDL_PROGRAMS
	if err == nil && programs != "" {
		progDir := filepath.Join(programs, "魔丸")
		_ = os.MkdirAll(progDir, 0755)
		progLnk := filepath.Join(progDir, "魔丸.lnk")
		_ = createNativeShortcut(progLnk, appExe, installDir, iconTarget, "魔丸 AI 智能助手 (Mowan Agent)")
	}

	return nil
}

type browseInfo struct {
	hwndOwner      uintptr
	pidlRoot       uintptr
	pszDisplayName *uint16
	lpszTitle      *uint16
	ulFlags        uint32
	_pad           uint32
	lpfn           uintptr
	lParam         uintptr
	iImage         int32
	_pad2          int32
}

func pickFolder(hwndOwner uintptr, title string) (string, error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	procCoInitialize.Call(0)
	defer procCoUninitialize.Call()

	titlePtr, _ := syscall.UTF16PtrFromString(title)
	displayBuf := make([]uint16, 260)
	bi := browseInfo{
		hwndOwner:      hwndOwner,
		pszDisplayName: &displayBuf[0],
		lpszTitle:      titlePtr,
		ulFlags:        0x00000001 | 0x00000040, // BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE
	}
	pidl, _, _ := procSHBrowseForFolderW.Call(uintptr(unsafe.Pointer(&bi)))
	if pidl == 0 {
		return "", nil
	}
	defer procCoTaskMemFree.Call(pidl)

	pathBuf := make([]uint16, 1024)
	r, _, _ := procSHGetPathFromIDListW.Call(pidl, uintptr(unsafe.Pointer(&pathBuf[0])))
	if r == 0 {
		return "", fmt.Errorf("failed to get path from ID list")
	}
	return syscall.UTF16ToString(pathBuf), nil
}

type InstallUI struct {
	hwndMain       uintptr
	hwndTitle      uintptr
	hwndPathPrompt uintptr
	hwndEditPath   uintptr
	hwndBtnBrowse  uintptr
	hwndBtnInstall uintptr
	hwndBtnCancel  uintptr
	hwndProg       uintptr
	hwndDesc       uintptr
	hwndFooter     uintptr

	installDir     string
	installStarted bool
	userCancelled  bool
}

var activeUI *InstallUI

func windowProc(hwnd uintptr, uMsg uint32, wParam uintptr, lParam uintptr) uintptr {
	switch uMsg {
	case 0x0111: // WM_COMMAND
		cmdId := int(wParam & 0xFFFF)
		if activeUI != nil {
			switch cmdId {
			case idBtnBrowse:
				selected, err := pickFolder(activeUI.hwndMain, "请选择魔丸安装目录：")
				if err == nil && selected != "" {
					base := filepath.Base(selected)
					if selected == `\` || base == `\` || base == "." || !strings.EqualFold(base, "Mowan-Agent") {
						selected = filepath.Join(selected, "Mowan-Agent")
					}
					activeUI.SetInstallPath(selected)
				}
				return 0
			case idBtnInstall:
				path := strings.TrimSpace(activeUI.GetInstallPath())
				if path == "" {
					showMessage("提示", "安装路径不能为空，请选择或输入有效的安装路径。", 0x30)
					return 0
				}
				if strings.ContainsAny(path, "*?\"<>|") {
					showMessage("提示", "安装路径包含非法字符，请重新输入或通过[浏览]按钮选择。", 0x30)
					return 0
				}
				activeUI.installDir = filepath.Clean(path)
				activeUI.SwitchToInstalling()
				activeUI.installStarted = true
				return 0
			case idBtnCancel:
				activeUI.userCancelled = true
				destroyWindow.Call(activeUI.hwndMain)
				return 0
			}
		}
	case 0x0010: // WM_CLOSE
		if activeUI != nil {
			activeUI.userCancelled = true
		}
		destroyWindow.Call(hwnd)
		return 0
	}
	r, _, _ := defWindowProc.Call(hwnd, uintptr(uMsg), wParam, lParam)
	return r
}

func createInstallUI(initialDir string) (*InstallUI, error) {
	ic := initControlsPayload{
		dwSize: uint32(unsafe.Sizeof(initControlsPayload{})),
		dwICC:  0x00000020, // ICC_PROGRESS_CLASS
	}
	initCommonControlsEx.Call(uintptr(unsafe.Pointer(&ic)))

	className, _ := syscall.UTF16PtrFromString("MowanAgentInstallerClass")
	wndTitle, _ := syscall.UTF16PtrFromString("魔丸 安装向导")

	wcls := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		lpfnWndProc:   syscall.NewCallback(windowProc),
		lpszClassName: className,
		hbrBackground: 6, // COLOR_WINDOW + 1
	}
	registerClassEx.Call(uintptr(unsafe.Pointer(&wcls)))

	width := int32(520)
	height := int32(250)

	sw, _, _ := getSystemMetrics.Call(smCxScreen)
	sh, _, _ := getSystemMetrics.Call(smCyScreen)
	x := (int32(sw) - width) / 2
	y := (int32(sh) - height) / 2

	style := uint32(0x00CA0000) // WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX
	hwndMain, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(wndTitle)),
		uintptr(style|wsVisible),
		uintptr(x), uintptr(y), uintptr(width), uintptr(height),
		0, 0, 0, 0,
	)

	staticClass, _ := syscall.UTF16PtrFromString("STATIC")
	editClass, _ := syscall.UTF16PtrFromString("EDIT")
	btnClass, _ := syscall.UTF16PtrFromString("BUTTON")
	progClass, _ := syscall.UTF16PtrFromString("msctls_progress32")

	titleText, _ := syscall.UTF16PtrFromString("欢迎安装 魔丸 (Mowan Agent)")
	hwndTitle, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(staticClass)),
		uintptr(unsafe.Pointer(titleText)),
		uintptr(wsChild|wsVisible),
		28, 18, 460, 24,
		hwndMain, 0, 0, 0,
	)

	// Phase 1 controls
	promptText, _ := syscall.UTF16PtrFromString("目标安装路径（支持任意盘符与目录）：")
	hwndPathPrompt, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(staticClass)),
		uintptr(unsafe.Pointer(promptText)),
		uintptr(wsChild|wsVisible),
		28, 52, 460, 20,
		hwndMain, 0, 0, 0,
	)

	pathInitText, _ := syscall.UTF16PtrFromString(initialDir)
	hwndEditPath, _, _ := createWindowEx.Call(
		0x00000200, // WS_EX_CLIENTEDGE
		uintptr(unsafe.Pointer(editClass)),
		uintptr(unsafe.Pointer(pathInitText)),
		uintptr(wsChild|wsVisible|wsBorder|wsTabStop|esAutoHScroll),
		28, 76, 365, 26,
		hwndMain, uintptr(idEditPath), 0, 0,
	)

	browseBtnText, _ := syscall.UTF16PtrFromString("浏览...")
	hwndBtnBrowse, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(btnClass)),
		uintptr(unsafe.Pointer(browseBtnText)),
		uintptr(wsChild|wsVisible|wsTabStop|bsPushButton),
		403, 75, 85, 28,
		hwndMain, uintptr(idBtnBrowse), 0, 0,
	)

	footerText, _ := syscall.UTF16PtrFromString("安装完成后将自动在桌面生成快捷方式，并在浏览器中打开控制台。")
	hwndFooter, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(staticClass)),
		uintptr(unsafe.Pointer(footerText)),
		uintptr(wsChild|wsVisible),
		28, 116, 460, 20,
		hwndMain, 0, 0, 0,
	)

	installBtnText, _ := syscall.UTF16PtrFromString("立即安装")
	hwndBtnInstall, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(btnClass)),
		uintptr(unsafe.Pointer(installBtnText)),
		uintptr(wsChild|wsVisible|wsTabStop|bsDefPushBtn),
		288, 155, 100, 32,
		hwndMain, uintptr(idBtnInstall), 0, 0,
	)

	cancelBtnText, _ := syscall.UTF16PtrFromString("取消")
	hwndBtnCancel, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(btnClass)),
		uintptr(unsafe.Pointer(cancelBtnText)),
		uintptr(wsChild|wsVisible|wsTabStop|bsPushButton),
		398, 155, 90, 32,
		hwndMain, uintptr(idBtnCancel), 0, 0,
	)

	// Phase 2 controls (initially hidden)
	hwndProg, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(progClass)),
		0,
		uintptr(wsChild|pbsSmooth),
		28, 60, 460, 26,
		hwndMain, 0, 0, 0,
	)
	sendMessage.Call(hwndProg, pbmSetRange32, 0, 100)

	descText, _ := syscall.UTF16PtrFromString("准备解压核心组件...")
	hwndDesc, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(staticClass)),
		uintptr(unsafe.Pointer(descText)),
		uintptr(wsChild),
		28, 98, 460, 45,
		hwndMain, 0, 0, 0,
	)

	hFont, _, _ := getStockObject.Call(defaultGuiFont)
	if hFont != 0 {
		sendMessage.Call(hwndTitle, wmSetFont, hFont, 1)
		sendMessage.Call(hwndPathPrompt, wmSetFont, hFont, 1)
		sendMessage.Call(hwndEditPath, wmSetFont, hFont, 1)
		sendMessage.Call(hwndBtnBrowse, wmSetFont, hFont, 1)
		sendMessage.Call(hwndBtnInstall, wmSetFont, hFont, 1)
		sendMessage.Call(hwndBtnCancel, wmSetFont, hFont, 1)
		sendMessage.Call(hwndDesc, wmSetFont, hFont, 1)
		sendMessage.Call(hwndFooter, wmSetFont, hFont, 1)
	}

	showWindow.Call(hwndMain, 1)
	updateWindow.Call(hwndMain)

	ui := &InstallUI{
		hwndMain:       hwndMain,
		hwndTitle:      hwndTitle,
		hwndPathPrompt: hwndPathPrompt,
		hwndEditPath:   hwndEditPath,
		hwndBtnBrowse:  hwndBtnBrowse,
		hwndBtnInstall: hwndBtnInstall,
		hwndBtnCancel:  hwndBtnCancel,
		hwndProg:       hwndProg,
		hwndDesc:       hwndDesc,
		hwndFooter:     hwndFooter,
		installDir:     initialDir,
	}
	activeUI = ui
	return ui, nil
}

func (ui *InstallUI) GetInstallPath() string {
	buf := make([]uint16, 1024)
	r, _, _ := getWindowText.Call(ui.hwndEditPath, uintptr(unsafe.Pointer(&buf[0])), 1024)
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

func (ui *InstallUI) SetInstallPath(path string) {
	p, _ := syscall.UTF16PtrFromString(path)
	setWindowText.Call(ui.hwndEditPath, uintptr(unsafe.Pointer(p)))
}

func (ui *InstallUI) SwitchToInstalling() {
	showWindow.Call(ui.hwndPathPrompt, swHide)
	showWindow.Call(ui.hwndEditPath, swHide)
	showWindow.Call(ui.hwndBtnBrowse, swHide)
	showWindow.Call(ui.hwndBtnInstall, swHide)
	showWindow.Call(ui.hwndBtnCancel, swHide)

	titleText, _ := syscall.UTF16PtrFromString("正在安装 魔丸，请稍候...")
	setWindowText.Call(ui.hwndTitle, uintptr(unsafe.Pointer(titleText)))

	showWindow.Call(ui.hwndProg, swShow)
	showWindow.Call(ui.hwndDesc, swShow)

	setWindowPos.Call(ui.hwndFooter, 0, 28, 155, 460, 20, 0x0004|0x0010)

	updateWindow.Call(ui.hwndMain)
}

func (ui *InstallUI) ProcessMessages() {
	var m msg
	for {
		r, _, _ := peekMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0, 1) // PM_REMOVE = 1
		if r == 0 {
			break
		}
		translateMessage.Call(uintptr(unsafe.Pointer(&m)))
		dispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
}

func (ui *InstallUI) SetProgress(pct int, desc string) {
	sendMessage.Call(ui.hwndProg, pbmSetPos, uintptr(pct), 0)
	textPtr, _ := syscall.UTF16PtrFromString(desc)
	setWindowText.Call(ui.hwndDesc, uintptr(unsafe.Pointer(textPtr)))
	updateWindow.Call(ui.hwndDesc)
}

func (ui *InstallUI) SetTitle(title string) {
	textPtr, _ := syscall.UTF16PtrFromString(title)
	setWindowText.Call(ui.hwndTitle, uintptr(unsafe.Pointer(textPtr)))
}

func (ui *InstallUI) Close() {
	destroyWindow.Call(ui.hwndMain)
}

func toExtendedPath(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		abs = p
	}
	if strings.HasPrefix(abs, `\\?\`) {
		return abs
	}
	if strings.HasPrefix(abs, `\\`) {
		return `\\?\UNC\` + abs[2:]
	}
	return `\\?\` + abs
}

func truncateName(name string, maxLen int) string {
	if len(name) <= maxLen {
		return name
	}
	return "..." + name[len(name)-(maxLen-3):]
}

func logMsg(format string, a ...interface{}) {
	logPath := filepath.Join(os.TempDir(), "mowan-setup.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err == nil {
		defer f.Close()
		fmt.Fprintf(f, "[%s] ", time.Now().Format("15:04:05"))
		fmt.Fprintf(f, format+"\n", a...)
	}
}

func main() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	logMsg("Installer started, raw os.Args: %v", os.Args)
	exePath, err := os.Executable()
	if err != nil {
		logMsg("Error locating exe: %v", err)
		showMessage("安装错误", "无法定位安装程序路径: "+err.Error(), 0x10)
		return
	}
	logMsg("Executable path: %s", exePath)

	isSilent := false
	noLaunch := false
	testGui := false
	customDir := ""
	for i := 1; i < len(os.Args); i++ {
		arg := os.Args[i]
		if arg == "-y" || arg == "--silent" || arg == "-s" || arg == "/S" {
			isSilent = true
		} else if arg == "--no-launch" {
			noLaunch = true
		} else if arg == "--test-gui" {
			testGui = true
			noLaunch = true
		} else if (arg == "--dir" || arg == "-d") && i+1 < len(os.Args) {
			customDir = os.Args[i+1]
			i++
		}
	}

	installDir := getInstallDir()
	if customDir != "" {
		installDir = customDir
	}
	logMsg("Default install target dir: %s", installDir)

	var ui *InstallUI
	if !isSilent {
		var err error
		ui, err = createInstallUI(installDir)
		if err != nil {
			logMsg("Failed to create UI: %v", err)
			return
		}

		if !testGui {
			// Phase 1: Wait for user to confirm path or cancel
			for !ui.installStarted && !ui.userCancelled {
				ui.ProcessMessages()
				time.Sleep(15 * time.Millisecond)
			}
			if ui.userCancelled {
				logMsg("Installation cancelled by user")
				ui.Close()
				return
			}
		} else {
			ui.SwitchToInstalling()
			ui.installStarted = true
		}

		installDir = ui.installDir
	}

	logMsg("Final install target dir: %s", installDir)
	killOldInstances(installDir)

	zipReader, err := zip.OpenReader(exePath)
	if err != nil {
		siblingZip := filepath.Join(filepath.Dir(exePath), "payload.zip")
		zipReader, err = zip.OpenReader(siblingZip)
		if err != nil {
			logMsg("Failed to open zip reader: %v", err)
			if ui != nil {
				ui.Close()
			}
			if !isSilent {
				showMessage("安装错误", "未能找到安装数据包 (payload.zip)。\n请确保安装程序完整无损。", 0x10)
			}
			return
		}
	}
	defer zipReader.Close()

	if err := os.MkdirAll(installDir, 0755); err != nil {
		logMsg("Failed to create install dir: %v", err)
		if ui != nil {
			ui.Close()
		}
		if !isSilent {
			showMessage("安装错误", "无法创建安装目录: "+err.Error(), 0x10)
		}
		return
	}

	type progressMsg struct {
		pct  int
		desc string
	}
	progressChan := make(chan progressMsg, 256)
	installDone := make(chan struct{})

	go func() {
		defer close(installDone)

		// 4. Pre-create all directories concurrently
		progressChan <- progressMsg{pct: 5, desc: "正在初始化安装目录结构..."}
		dirs := make(map[string]struct{})
		for _, file := range zipReader.File {
			path := filepath.Join(installDir, file.Name)
			if file.FileInfo().IsDir() {
				dirs[path] = struct{}{}
			} else {
				dirs[filepath.Dir(path)] = struct{}{}
			}
		}

		dirChan := make(chan string, 1024)
		var dirWg sync.WaitGroup
		for i := 0; i < 8; i++ {
			dirWg.Add(1)
			go func() {
				defer dirWg.Done()
				for d := range dirChan {
					_ = os.MkdirAll(toExtendedPath(d), 0755)
				}
			}()
		}
		for dir := range dirs {
			dirChan <- dir
		}
		close(dirChan)
		dirWg.Wait()

		// 5. Multi-worker concurrent file extraction
		totalFiles := int64(len(zipReader.File))
		var processedCount int64
		numWorkers := 8
		jobs := make(chan *zip.File, 2048)
		var wg sync.WaitGroup

		for w := 0; w < numWorkers; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				buf := make([]byte, 64*1024)
				for file := range jobs {
					if !file.FileInfo().IsDir() {
						path := filepath.Join(installDir, file.Name)
						extPath := toExtendedPath(path)

						outFile, err := os.OpenFile(extPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
						if err != nil {
							outFile, err = os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
						}
						if err == nil {
							rc, err := file.Open()
							if err == nil {
								_, _ = io.CopyBuffer(outFile, rc, buf)
								rc.Close()
							}
							outFile.Close()
						}
					}
					cur := atomic.AddInt64(&processedCount, 1)
					if cur%100 == 0 || cur == totalFiles {
						pct := 5 + int(float64(cur)/float64(totalFiles)*85)
						select {
						case progressChan <- progressMsg{pct: pct, desc: fmt.Sprintf("正在极速释放核心组件 [%d/%d]...", cur, totalFiles)}:
						default:
						}
					}
				}
			}()
		}

		for _, f := range zipReader.File {
			jobs <- f
		}
		close(jobs)
		wg.Wait()

		logMsg("Extraction completed successfully (%d files)", totalFiles)
	}()

	ticker := time.NewTicker(15 * time.Millisecond)
	defer ticker.Stop()

	loopDone := false
	for !loopDone {
		if ui != nil {
			ui.ProcessMessages()
		}

		select {
		case p := <-progressChan:
			if ui != nil {
				ui.SetProgress(p.pct, p.desc)
			}
		case <-installDone:
			loopDone = true
		case <-ticker.C:
		}
	}

	if ui != nil {
		ui.SetProgress(95, "正在生成桌面快捷方式与系统启动项...")
		ui.ProcessMessages()
	}
	_ = createAllShortcuts(installDir)
	logMsg("Shortcuts created")

	if ui != nil {
		ui.SetProgress(100, "安装完毕！正在启动 魔丸...")
		ui.SetTitle("魔丸 安装完成！")
		for k := 0; k < 25; k++ {
			ui.ProcessMessages()
			time.Sleep(20 * time.Millisecond)
		}
		ui.Close()
	}

	if !noLaunch {
		appExe := filepath.Join(installDir, "Mowan-Agent.exe")
		cmd := exec.Command(appExe)
		cmd.Dir = installDir
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000008 | 0x00000200,
		}
		_ = cmd.Start()
		logMsg("Launched Mowan-Agent.exe")
	}
	logMsg("Installer finished successfully")
}
