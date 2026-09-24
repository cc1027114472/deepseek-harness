package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type TunnelStatusResponse struct {
	Installed bool   `json:"installed"`
	Running   bool   `json:"running"`
	URL       string `json:"url,omitempty"`
	AuthToken string `json:"authToken,omitempty"`
	Error     string `json:"error,omitempty"`
}

type ServerManager struct {
	mu         sync.Mutex
	cmd        *exec.Cmd
	rootDir    string
	port       int
	serviceURL string
	stopped    bool
}

func findRootDir() string {
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = filepath.Abs(".")
	}
	dir := filepath.Dir(exePath)

	// Check if current dir has apps/cli/lib/bin.js
	if _, err := os.Stat(filepath.Join(dir, "apps", "cli", "lib", "bin.js")); err == nil {
		return dir
	}
	// Check parent dir
	parent := filepath.Dir(dir)
	if _, err := os.Stat(filepath.Join(parent, "apps", "cli", "lib", "bin.js")); err == nil {
		return parent
	}
	// Fallback to working directory
	cwd, _ := os.Getwd()
	return cwd
}

func (s *ServerManager) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	binPath := filepath.Join(s.rootDir, "apps", "cli", "lib", "bin.js")
	if _, err := os.Stat(binPath); err != nil {
		return fmt.Errorf("harness entrypoint not found: %s", binPath)
	}

	nodeBin := "node"
	// Check if bundled node exists in runtime/node or similar
	bundledNode := filepath.Join(s.rootDir, "runtime", "node.exe")
	if _, err := os.Stat(bundledNode); err == nil {
		nodeBin = bundledNode
	}

	cmd := exec.Command(nodeBin, binPath, "web", "--port", strconv.Itoa(s.port), "--no-open")
	cmd.Dir = s.rootDir

	// Hide console window on Windows
	setHideWindow(cmd)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start node server: %w", err)
	}

	s.cmd = cmd
	s.stopped = false

	go func() {
		_ = cmd.Wait()
		s.mu.Lock()
		s.cmd = nil
		s.mu.Unlock()
	}()

	return nil
}

func (s *ServerManager) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.stopped = true
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		s.cmd = nil
	}
}

func (s *ServerManager) Restart() error {
	s.Stop()
	time.Sleep(500 * time.Millisecond)
	return s.Start()
}

func waitForReady(url string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 1 * time.Second}

	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			_ = resp.Body.Close()
			return true
		}
		time.Sleep(300 * time.Millisecond)
	}
	return false
}

func fetchTunnelStatus(baseURL string) (*TunnelStatusResponse, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(baseURL + "/api/tunnel/status")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var status TunnelStatusResponse
	if err := json.Unmarshal(body, &status); err != nil {
		return nil, err
	}
	return &status, nil
}

func checkPortActive(port int) bool {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d", port))
	if err == nil {
		_ = resp.Body.Close()
		return true
	}
	return false
}

func parseDeeplinkToWebURL(deeplink string, port int) string {
	u, err := url.Parse(deeplink)
	if err != nil {
		return fmt.Sprintf("http://127.0.0.1:%d/#/settings", port)
	}

	q := u.Query()
	q.Set("action", "import-provider")

	return fmt.Sprintf("http://127.0.0.1:%d/#/settings?%s", port, q.Encode())
}

func main() {
	portFlag := flag.Int("port", 0, "Web server port (default: 3090)")
	noOpenFlag := flag.Bool("no-open", false, "Do not auto-open browser on launch")
	flag.Parse()

	// Automatically ensure mowan:// custom URL scheme is registered
	registerURLScheme("mowan")

	rootDir := findRootDir()
	port := *portFlag

	if port == 0 {
		port = 3090
	}

	serviceURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	// Check if invoked via mowan:// deeplink
	var deeplinkURL string
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "mowan://") {
			deeplinkURL = arg
			break
		}
	}

	targetURL := serviceURL
	if deeplinkURL != "" {
		targetURL = parseDeeplinkToWebURL(deeplinkURL, port)
	}

	// If server is already running on this port, simply open target in browser and exit
	if checkPortActive(port) {
		_ = OpenBrowser(targetURL)
		return
	}

	server := &ServerManager{
		rootDir:    rootDir,
		port:       port,
		serviceURL: serviceURL,
	}

	// Start harness server
	if err := server.Start(); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
	}

	// Auto-open browser when ready
	if !*noOpenFlag {
		go func() {
			if waitForReady(serviceURL, 20*time.Second) {
				_ = OpenBrowser(targetURL)
			}
		}()
	}

	var tray *TrayManager

	onOpen := func() {
		_ = OpenBrowser(serviceURL)
	}

	onCopyURL := func() {
		status, err := fetchTunnelStatus(serviceURL)
		if err != nil {
			if tray != nil {
				tray.ShowToast("公网穿透", "无法连接本地魔丸服务，请稍候再试。")
			}
			return
		}

		if status.Running && status.URL != "" {
			fullURL := status.URL
			if status.AuthToken != "" {
				fullURL = fmt.Sprintf("%s/?token=%s", status.URL, status.AuthToken)
			}
			_ = SetClipboardText(fullURL)
			if tray != nil {
				tray.ShowToast("公网穿透链接已复制", fmt.Sprintf("已复制到剪贴板：\n%s\n可在手机浏览器直接粘贴打开！", fullURL))
			}
		} else {
			if tray != nil {
				tray.ShowToast("公网穿透未开启", "公网穿透当前处于停止状态。\n请点击托盘图标打开控制台，在「设置 - 远程访问」中点击启动。")
			}
		}
	}

	onRestart := func() {
		if err := server.Restart(); err != nil {
			if tray != nil {
				tray.ShowToast("重启服务", fmt.Sprintf("重启失败: %v", err))
			}
		} else {
			if tray != nil {
				tray.ShowToast("重启服务", "本地魔丸服务正在重新启动...")
			}
			go func() {
				if waitForReady(serviceURL, 20*time.Second) {
					_ = OpenBrowser(serviceURL)
				}
			}()
		}
	}

	onExit := func() {
		server.Stop()
		if tray != nil {
			tray.Close()
		}
		os.Exit(0)
	}

	var err error
	tray, err = InitTray(serviceURL, onOpen, onCopyURL, onRestart, onExit)
	if err != nil {
		fmt.Printf("Failed to initialize tray: %v\n", err)
		server.Stop()
		os.Exit(1)
	}

	// Run blocking tray loop
	tray.RunMessageLoop()
}
