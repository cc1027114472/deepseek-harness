import os
import sys
import time
from pathlib import Path
import paramiko

HOST = "154.44.1.151"
USER = "root"
PASSWORD = "gKaB1W4HZDv8"
REMOTE_DIR = "/var/www/sub2api-downloads"

def progress_callback(transferred, total):
    pct = (transferred / total) * 100 if total > 0 else 0
    mb_transferred = transferred / (1024 * 1024)
    mb_total = total / (1024 * 1024)
    sys.stdout.write(f"\r  Uploading: {pct:.1f}% ({mb_transferred:.1f}MB / {mb_total:.1f}MB)")
    sys.stdout.flush()

def upload_release(version_tag=None):
    root_dir = Path(__file__).resolve().parent.parent
    sub2api_downloads = Path("D:/GOWorks/fanzhongli/sub2api/frontend/public/downloads")
    dist_dir = root_dir / "dist"

    files_to_upload = []

    # 1. latest.json
    local_json = sub2api_downloads / "latest.json"
    if local_json.exists():
        files_to_upload.append((local_json, "latest.json"))

    # 2. Main versioned exe (or fallback latest.exe)
    target_remote_exe = None
    if version_tag:
        clean_v = version_tag.lstrip("v")
        v_exe = sub2api_downloads / f"Mowan-Agent-Setup-{clean_v}.exe"
        if not v_exe.exists():
            v_exe = dist_dir / f"Mowan-Agent-Setup-{clean_v}.exe"
        if v_exe.exists():
            target_remote_exe = f"Mowan-Agent-Setup-{clean_v}.exe"
            files_to_upload.append((v_exe, target_remote_exe))

    if not target_remote_exe:
        latest_exe = sub2api_downloads / "Mowan-Agent-Setup-latest.exe"
        if not latest_exe.exists():
            latest_exe = dist_dir / "Mowan-Agent-Setup.exe"
        if latest_exe.exists():
            target_remote_exe = "Mowan-Agent-Setup-latest.exe"
            files_to_upload.append((latest_exe, target_remote_exe))

    if not files_to_upload:
        print("No files found to upload!")
        return

    print(f"Connecting to {HOST} via SSH/SFTP...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    connected = False
    for attempt in range(1, 6):
        try:
            print(f"  Connection attempt {attempt}/5...")
            ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30, banner_timeout=60, auth_timeout=60)
            connected = True
            break
        except Exception as e:
            print(f"  Attempt {attempt} failed: {e}")
            time.sleep(3)
    if not connected:
        raise RuntimeError("Failed to connect to SSH after 5 attempts")

    # Ensure remote dir
    ssh.exec_command(f"mkdir -p {REMOTE_DIR}")

    sftp = ssh.open_sftp()
    print(f"Starting upload to {REMOTE_DIR}:")
    
    for local_path, remote_name in files_to_upload:
        remote_path = f"{REMOTE_DIR}/{remote_name}"
        file_size = local_path.stat().st_size
        print(f"\n-> {local_path.name} -> {remote_path} ({file_size / (1024*1024):.1f} MB)")
        sftp.put(str(local_path), remote_path, callback=progress_callback)
        print()

    sftp.close()
    alias_cmd = ""
    if target_remote_exe:
        clean_v = target_remote_exe.replace("Mowan-Agent-Setup-", "").replace(".exe", "")
        alias_cmd = (
            f"cp -f {REMOTE_DIR}/{target_remote_exe} {REMOTE_DIR}/Mowan-Agent-Setup-latest.exe && "
            f"cp -f {REMOTE_DIR}/{target_remote_exe} {REMOTE_DIR}/Mowan-Agent-Setup.exe && "
            f"cp -f {REMOTE_DIR}/{target_remote_exe} {REMOTE_DIR}/Mowan-Harness-Setup.exe && "
            f"ln -sf Mowan-Agent-Setup-{clean_v}.exe {REMOTE_DIR}/mowan-agent-setup-{clean_v}.exe && "
            f"ln -sf Mowan-Agent-Setup-latest.exe {REMOTE_DIR}/mowan-agent-setup-latest.exe && "
            f"ln -sf Mowan-Agent-Setup.exe {REMOTE_DIR}/mowan-agent-setup.exe && "
            f"ln -sf Mowan-Harness-Setup.exe {REMOTE_DIR}/mowan-harness-setup.exe && "
            f"ln -sf Mowan-Agent-Setup-latest.exe {REMOTE_DIR}/mowan-harness-portable.zip && "
        )
    cmd = (
        f"{alias_cmd}"
        f"mkdir -p /root/sub2api/deploy/data/public/downloads && "
        f"cp -rf {REMOTE_DIR}/* /root/sub2api/deploy/data/public/downloads/ && "
        f"chown -R www-data:www-data {REMOTE_DIR} && chmod -R 644 {REMOTE_DIR}/* && chmod 755 {REMOTE_DIR} && "
        f"chown -R 1000:1000 /root/sub2api/deploy/data/public/downloads && chmod -R 755 /root/sub2api/deploy/data/public/downloads"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        print(f"Post-deploy command failed with status {exit_status}: {stderr.read().decode()}")
    ssh.close()

    print("\n" + "=" * 50)
    print("  All release files deployed to ukapi.cc!")
    print(f"  Live manifest: https://ukapi.cc/downloads/latest.json")
    print(f"  Live download: https://ukapi.cc/downloads/Mowan-Agent-Setup-latest.exe")
    print("=" * 50)

if __name__ == "__main__":
    v = sys.argv[1] if len(sys.argv) > 1 else None
    upload_release(v)
