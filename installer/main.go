package main

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32Mod               = syscall.NewLazyDLL("user32.dll")
	comctl32Mod             = syscall.NewLazyDLL("comctl32.dll")
	gdi32Mod                = syscall.NewLazyDLL("gdi32.dll")
	shell32Mod              = syscall.NewLazyDLL("shell32.dll")
	modOle32                = syscall.NewLazyDLL("ole32.dll")
	messageBox              = user32Mod.NewProc("MessageBoxW")
	registerClassEx         = user32Mod.NewProc("RegisterClassExW")
	createWindowEx          = user32Mod.NewProc("CreateWindowExW")
	showWindow              = user32Mod.NewProc("ShowWindow")
	updateWindow            = user32Mod.NewProc("UpdateWindow")
	setWindowText           = user32Mod.NewProc("SetWindowTextW")
	sendMessage             = user32Mod.NewProc("SendMessageW")
	peekMessage             = user32Mod.NewProc("PeekMessageW")
	translateMessage        = user32Mod.NewProc("TranslateMessage")
	dispatchMessage         = user32Mod.NewProc("DispatchMessageW")
	defWindowProc           = user32Mod.NewProc("DefWindowProcW")
	destroyWindow           = user32Mod.NewProc("DestroyWindow")
	getSystemMetrics        = user32Mod.NewProc("GetSystemMetrics")
	initCommonControlsEx    = comctl32Mod.NewProc("InitCommonControlsEx")
	getStockObject          = gdi32Mod.NewProc("GetStockObject")
	procCoInitialize        = modOle32.NewProc("CoInitialize")
	procCoUninitialize      = modOle32.NewProc("CoUninitialize")
	procCoCreateInstance    = modOle32.NewProc("CoCreateInstance")
	procSHGetFolderPathW    = shell32Mod.NewProc("SHGetFolderPathW")
)

const (
	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	wsChild            = 0x40000000
	pbmSetRange32      = 0x0406
	pbmSetPos          = 0x0402
	pbsSmooth          = 0x01
	wmSetFont          = 0x0030
	defaultGuiFont     = 17
	smCxScreen         = 0
	smCyScreen         = 1
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
	return filepath.Join(localAppData, "Programs", "Mowan-Harness")
}

type COMGUID struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

var (
	clsidShellLink  = COMGUID{0x00021401, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidShellLinkW   = COMGUID{0x000214F9, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidPersistFile  = COMGUID{0x0000010b, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
)

func createNativeShortcut(dstLnk, targetPath, workDir, iconPath, description string) error {
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
	appExe := filepath.Join(installDir, "Mowan-Harness.exe")

	// 1. Desktop shortcut
	desktop, err := getWinFolderPath(0x0010) // CSIDL_DESKTOPDIRECTORY
	if err == nil && desktop != "" {
		deskLnk := filepath.Join(desktop, "Mowan Harness.lnk")
		_ = createNativeShortcut(deskLnk, appExe, installDir, appExe, "Mowan Harness Web AI Assistant")
	}

	// 2. Start Menu Programs shortcut
	programs, err := getWinFolderPath(0x0002) // CSIDL_PROGRAMS
	if err == nil && programs != "" {
		progDir := filepath.Join(programs, "Mowan Harness")
		_ = os.MkdirAll(progDir, 0755)
		progLnk := filepath.Join(progDir, "Mowan Harness.lnk")
		_ = createNativeShortcut(progLnk, appExe, installDir, appExe, "Mowan Harness Web AI Assistant")
	}

	return nil
}

func windowProc(hwnd uintptr, uMsg uint32, wParam uintptr, lParam uintptr) uintptr {
	r, _, _ := defWindowProc.Call(hwnd, uintptr(uMsg), wParam, lParam)
	return r
}

type InstallUI struct {
	hwndMain  uintptr
	hwndProg  uintptr
	hwndTitle uintptr
	hwndDesc  uintptr
}

func createInstallUI() (*InstallUI, error) {
	// Initialize common controls
	ic := initControlsPayload{
		dwSize: uint32(unsafe.Sizeof(initControlsPayload{})),
		dwICC:  0x00000020, // ICC_PROGRESS_CLASS
	}
	initCommonControlsEx.Call(uintptr(unsafe.Pointer(&ic)))

	className, _ := syscall.UTF16PtrFromString("MowanHarnessInstallerClass")
	wndTitle, _ := syscall.UTF16PtrFromString("Mowan Harness 安装向导")

	wcls := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		lpfnWndProc:   syscall.NewCallback(windowProc),
		lpszClassName: className,
		hbrBackground: 6, // COLOR_WINDOW + 1
	}
	registerClassEx.Call(uintptr(unsafe.Pointer(&wcls)))

	width := int32(500)
	height := int32(230)

	sw, _, _ := getSystemMetrics.Call(smCxScreen)
	sh, _, _ := getSystemMetrics.Call(smCyScreen)
	x := (int32(sw) - width) / 2
	y := (int32(sh) - height) / 2

	// Main window (fixed size, dialog style)
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
	progClass, _ := syscall.UTF16PtrFromString("msctls_progress32")

	// 1. Title static text
	titleText, _ := syscall.UTF16PtrFromString("正在安装 Mowan Harness，请稍候...")
	hwndTitle, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(staticClass)),
		uintptr(unsafe.Pointer(titleText)),
		uintptr(wsChild|wsVisible),
		28, 20, 440, 24,
		hwndMain, 0, 0, 0,
	)

	// 2. Progress bar
	hwndProg, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(progClass)),
		0,
		uintptr(wsChild|wsVisible|pbsSmooth),
		28, 55, 440, 24,
		hwndMain, 0, 0, 0,
	)
	sendMessage.Call(hwndProg, pbmSetRange32, 0, 100)

	// 3. Status detail label
	descText, _ := syscall.UTF16PtrFromString("准备解压组件...")
	hwndDesc, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(staticClass)),
		uintptr(unsafe.Pointer(descText)),
		uintptr(wsChild|wsVisible),
		28, 90, 440, 45,
		hwndMain, 0, 0, 0,
	)

	// 4. Bottom footer note
	footerText, _ := syscall.UTF16PtrFromString("安装完成后将自动在桌面生成快捷方式，并在浏览器中打开控制台。")
	hwndFooter, _, _ := createWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(staticClass)),
		uintptr(unsafe.Pointer(footerText)),
		uintptr(wsChild|wsVisible),
		28, 145, 440, 20,
		hwndMain, 0, 0, 0,
	)

	// Apply default clean UI font
	hFont, _, _ := getStockObject.Call(defaultGuiFont)
	if hFont != 0 {
		sendMessage.Call(hwndTitle, wmSetFont, hFont, 1)
		sendMessage.Call(hwndDesc, wmSetFont, hFont, 1)
		sendMessage.Call(hwndFooter, wmSetFont, hFont, 1)
	}

	showWindow.Call(hwndMain, 1)
	updateWindow.Call(hwndMain)

	return &InstallUI{
		hwndMain:  hwndMain,
		hwndProg:  hwndProg,
		hwndTitle: hwndTitle,
		hwndDesc:  hwndDesc,
	}, nil
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
	ui.ProcessMessages()
}

func (ui *InstallUI) SetTitle(title string) {
	textPtr, _ := syscall.UTF16PtrFromString(title)
	setWindowText.Call(ui.hwndTitle, uintptr(unsafe.Pointer(textPtr)))
	ui.ProcessMessages()
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
	customDir := ""
	for i := 1; i < len(os.Args); i++ {
		arg := os.Args[i]
		if arg == "-y" || arg == "--silent" || arg == "-s" || arg == "/S" {
			isSilent = true
		} else if arg == "--no-launch" {
			noLaunch = true
		} else if (arg == "--dir" || arg == "-d") && i+1 < len(os.Args) {
			customDir = os.Args[i+1]
			i++
		}
	}
	logMsg("isSilent: %v, noLaunch: %v, customDir: %s", isSilent, noLaunch, customDir)

	installDir := getInstallDir()
	if customDir != "" {
		installDir = customDir
	}
	logMsg("Install target dir: %s", installDir)

	if !isSilent {
		confirm := showMessage(
			"Mowan Harness 安装向导",
			"欢迎使用 Mowan Harness 安装向导！\n\n程序将被安装到:\n"+installDir+"\n\n点击 [确定] 开始安装，点击 [取消] 退出。",
			0x01|0x40, // MB_OKCANCEL | MB_ICONINFORMATION
		)
		logMsg("Confirm dialog result: %d", confirm)
		if confirm != 1 {
			return
		}
	}

	// 1. Try to open ZIP reader from the executable itself (appended SFX payload)
	zipReader, err := zip.OpenReader(exePath)
	if err != nil {
		siblingZip := filepath.Join(filepath.Dir(exePath), "payload.zip")
		zipReader, err = zip.OpenReader(siblingZip)
		if err != nil {
			showMessage("安装错误", "未能找到安装数据包 (payload.zip)。\n请确保安装程序完整无损。", 0x10)
			return
		}
	}
	defer zipReader.Close()

	logMsg("Opened zipReader with %d files", len(zipReader.File))

	if err := os.MkdirAll(installDir, 0755); err != nil {
		logMsg("Failed to mkdir %s: %v", installDir, err)
		if !isSilent {
			showMessage("安装错误", "无法创建安装目录: "+err.Error(), 0x10)
		}
		return
	}
	logMsg("Created installDir successfully")

	// 2. Launch visual progress window (skip UI in headless silent mode)
	var ui *InstallUI
	if !isSilent {
		var uiErr error
		ui, uiErr = createInstallUI()
		if uiErr != nil {
			logMsg("Failed to create UI: %v", uiErr)
			showMessage("安装错误", "创建安装界面失败: "+uiErr.Error(), 0x10)
			return
		}
		defer ui.Close()
	}

	totalFiles := len(zipReader.File)
	if ui != nil {
		ui.SetProgress(0, fmt.Sprintf("正在准备释放文件 (共 %d 项)...", totalFiles))
	}

	// 3. Extract files with real-time UI updates
	for i, file := range zipReader.File {
		path := filepath.Join(installDir, file.Name)
		extPath := toExtendedPath(path)

		if file.FileInfo().IsDir() {
			_ = os.MkdirAll(extPath, 0755)
			continue
		}

		_ = os.MkdirAll(toExtendedPath(filepath.Dir(path)), 0755)

		outFile, err := os.OpenFile(extPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err != nil {
			outFile, err = os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		}
		if err == nil {
			rc, err := file.Open()
			if err == nil {
				_, _ = io.Copy(outFile, rc)
				rc.Close()
			}
			outFile.Close()
		}

		// Update UI progress every 50 files or on completion
		if ui != nil && (i%50 == 0 || i == totalFiles-1) {
			pct := int(float64(i+1) / float64(totalFiles) * 90) // 0-90% for file extraction
			ui.SetProgress(pct, fmt.Sprintf("正在释放 [%d/%d]: %s", i+1, totalFiles, truncateName(file.Name, 42)))
		}
	}

	// 4. Create shortcuts (90% - 98%)
	if ui != nil {
		ui.SetProgress(92, "正在生成桌面快捷方式与系统启动项...")
	}
	err = createAllShortcuts(installDir)
	logMsg("createAllShortcuts result: %v", err)
	time.Sleep(300 * time.Millisecond)

	// 5. Finished
	if ui != nil {
		ui.SetProgress(100, "安装完毕！即将自动启动 Mowan Harness...")
		ui.SetTitle("Mowan Harness 安装完成！")
		time.Sleep(900 * time.Millisecond)
		ui.Close()
	}
	logMsg("Installer finished successfully")

	// 6. Launch installed application
	if !noLaunch {
		appExe := filepath.Join(installDir, "Mowan-Harness.exe")
		cmd := exec.Command(appExe)
		cmd.Dir = installDir
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000,
		}
		_ = cmd.Start()
	}
}
