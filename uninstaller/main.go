package main

import (
	"flag"
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
	user32               = syscall.NewLazyDLL("user32.dll")
	shell32              = syscall.NewLazyDLL("shell32.dll")
	procMessageBoxW      = user32.NewProc("MessageBoxW")
	procSHGetFolderPathW = shell32.NewProc("SHGetFolderPathW")
)

const (
	MB_OK               = 0x00000000
	MB_YESNO            = 0x00000004
	MB_ICONINFORMATION  = 0x00000040
	MB_ICONQUESTION     = 0x00000020
	MB_ICONWARNING      = 0x00000030
	IDYES               = 6

	CSIDL_DESKTOPDIRECTORY = 0x0010
	CSIDL_PROGRAMS         = 0x0002
)

func showMessage(title, text string, uType uint) int {
	tPtr, _ := syscall.UTF16PtrFromString(title)
	mPtr, _ := syscall.UTF16PtrFromString(text)
	r, _, _ := procMessageBoxW.Call(0, uintptr(unsafe.Pointer(mPtr)), uintptr(unsafe.Pointer(tPtr)), uintptr(uType))
	return int(r)
}

func getWinFolderPath(csidl int) (string, error) {
	buf := make([]uint16, 260)
	r, _, _ := procSHGetFolderPathW.Call(0, uintptr(csidl), 0, 0, uintptr(unsafe.Pointer(&buf[0])))
	if r != 0 {
		return "", fmt.Errorf("SHGetFolderPathW error: 0x%x", r)
	}
	return syscall.UTF16ToString(buf), nil
}

func killRunningInstances(installDir string) {
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

	time.Sleep(500 * time.Millisecond)
}

func removeRegistry() {
	// 1. 删除控制面板/Windows设置中的卸载信息
	cmd1 := exec.Command("reg", "delete", `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Mowan-Agent`, "/f")
	cmd1.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	_ = cmd1.Run()

	// 2. 删除 mowan:// URL 协议关联
	cmd2 := exec.Command("reg", "delete", `HKCU\Software\Classes\mowan`, "/f")
	cmd2.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	_ = cmd2.Run()
}

func removeShortcuts() {
	if desktop, err := getWinFolderPath(CSIDL_DESKTOPDIRECTORY); err == nil {
		_ = os.Remove(filepath.Join(desktop, "魔丸.lnk"))
	}
	if progDir, err := getWinFolderPath(CSIDL_PROGRAMS); err == nil {
		_ = os.Remove(filepath.Join(progDir, "魔丸.lnk"))
		// 清理可能的子目录
		subDir := filepath.Join(progDir, "魔丸")
		if _, err := os.Stat(subDir); err == nil {
			_ = os.RemoveAll(subDir)
		}
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func main() {
	isStage2 := flag.Bool("stage2", false, "Run uninstallation in stage 2 from temp dir")
	installDirFlag := flag.String("install-dir", "", "Target installation directory to remove")
	isSilent := flag.Bool("silent", false, "Silent uninstallation without GUI prompts")
	isSilentShort := flag.Bool("y", false, "Silent uninstallation without GUI prompts")
	cleanDataFlag := flag.Bool("clean-data", false, "Clean personal ~/.mowan user data")
	flag.Parse()

	silent := *isSilent || *isSilentShort
	cleanData := *cleanDataFlag

	currentExe, err := os.Executable()
	if err != nil {
		if !silent {
			showMessage("卸载错误", "无法定位卸载程序路径: "+err.Error(), MB_OK|MB_ICONWARNING)
		}
		os.Exit(1)
	}
	currentExe, _ = filepath.Abs(currentExe)

	installDir := *installDirFlag
	if installDir == "" {
		installDir = filepath.Dir(currentExe)
	}
	installDir, _ = filepath.Abs(installDir)

	if !*isStage2 {
		// ==================== STAGE 1: 交互确认并迁移自身到 TEMP ====================
		if !silent {
			r := showMessage("魔丸 AI 智能助手 卸载向导", "确定要从您的电脑中彻底卸载 魔丸 AI 智能助手 (Mowan Agent) 吗？", MB_YESNO|MB_ICONQUESTION)
			if r != IDYES {
				os.Exit(0)
			}

			// 检查 ~/.mowan 是否存在
			userHome, _ := os.UserHomeDir()
			mowanDataDir := filepath.Join(userHome, ".mowan")
			if fi, err := os.Stat(mowanDataDir); err == nil && fi.IsDir() {
				rData := showMessage("清除数据", "检测到存在本地个人对话与模型配置 (~/.mowan)。\n\n点击【是】同时彻底清除对话数据；\n点击【否】保留历史数据（方便未来重新安装使用）。", MB_YESNO|MB_ICONQUESTION)
				if rData == IDYES {
					cleanData = true
				}
			}
		}

		// 将自身复制到系统临时目录，以便释放安装目录下的锁定
		tempExe := filepath.Join(os.TempDir(), fmt.Sprintf("mowan-uninst-%d.exe", os.Getpid()))
		if err := copyFile(currentExe, tempExe); err != nil {
			if !silent {
				showMessage("卸载错误", "无法准备卸载环境: "+err.Error(), MB_OK|MB_ICONWARNING)
			}
			os.Exit(1)
		}

		// 启动 Stage 2 进程
		args := []string{"--stage2", "--install-dir", installDir}
		if silent {
			args = append(args, "--silent")
		}
		if cleanData {
			args = append(args, "--clean-data")
		}

		cmd := exec.Command(tempExe, args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		if err := cmd.Start(); err != nil {
			if !silent {
				showMessage("卸载错误", "启动卸载进程失败: "+err.Error(), MB_OK|MB_ICONWARNING)
			}
			os.Exit(1)
		}

		// Stage 1 立即退出，使自身文件句柄关闭
		os.Exit(0)
	}

	// ==================== STAGE 2: 真正执行清理 ====================
	// 1. 关闭后台运行的服务与进程
	killRunningInstances(installDir)

	// 2. 清除桌面与开始菜单快捷方式
	removeShortcuts()

	// 3. 清理注册表关联 (卸载项与 mowan:// 协议)
	removeRegistry()

	// 4. 清理个人数据目录 (若用户选择)
	if cleanData {
		userHome, _ := os.UserHomeDir()
		if userHome != "" {
			_ = os.RemoveAll(filepath.Join(userHome, ".mowan"))
		}
	}

	// 5. 递归删除安装目录 (重试最多 5 次，处理可能存在的短暂句柄锁定)
	for i := 0; i < 5; i++ {
		time.Sleep(300 * time.Millisecond)
		err := os.RemoveAll(installDir)
		if err == nil || !dirExists(installDir) {
			break
		}
	}

	// 6. 弹出卸载完成通知
	if !silent {
		showMessage("卸载完成", "魔丸 AI 智能助手 已成功从您的电脑中卸载！", MB_OK|MB_ICONINFORMATION)
	}

	// 7. 安排临时卸载程序自杀删除 (延迟 2 秒删除自身)
	selfDeleteCmd := fmt.Sprintf(`cmd.exe /c ping 127.0.0.1 -n 2 > nul & del /f /q "%s"`, currentExe)
	cleanup := exec.Command("cmd.exe", "/c", selfDeleteCmd)
	cleanup.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	_ = cleanup.Start()
}

func dirExists(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}
