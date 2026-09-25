import os
import sys
import time
from pathlib import Path
import paramiko

HOST = "154.23.162.32"
USER = "root"
PASSWORD = "2Q99EAjlnb"
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

    # 2. Mowan-Agent-Setup-latest.exe
    latest_exe = sub2api_downloads / "Mowan-Agent-Setup-latest.exe"
    if not latest_exe.exists():
        latest_exe = dist_dir / "Mowan-Agent-Setup.exe"
    if latest_exe.exists():
        files_to_upload.append((latest_exe, "Mowan-Agent-Setup-latest.exe"))
        files_to_upload.append((latest_exe, "Mowan-Agent-Setup.exe"))
        files_to_upload.append((latest_exe, "Mowan-Harness-Setup.exe"))

    # 3. Versioned exe if present
    if version_tag:
        clean_v = version_tag.lstrip("v")
        v_exe = sub2api_downloads / f"Mowan-Agent-Setup-{clean_v}.exe"
        if v_exe.exists():
            files_to_upload.append((v_exe, f"Mowan-Agent-Setup-{clean_v}.exe"))

    if not files_to_upload:
        print("No files found to upload!")
        return

    print(f"Connecting to {HOST} via SSH/SFTP...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)

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
    cmd = (
        f"mkdir -p /root/sub2api/deploy/data/public/downloads && "
        f"cp -rf {REMOTE_DIR}/* /root/sub2api/deploy/data/public/downloads/ && "
        f"chown -R www-data:www-data {REMOTE_DIR} && chmod -R 644 {REMOTE_DIR}/* && chmod 755 {REMOTE_DIR} && "
        f"chown -R 1000:1000 /root/sub2api/deploy/data/public/downloads && chmod -R 755 /root/sub2api/deploy/data/public/downloads"
    )
    ssh.exec_command(cmd)
    ssh.close()

    print("\n" + "=" * 50)
    print("  All release files deployed to ukapi.cc!")
    print(f"  Live manifest: https://ukapi.cc/downloads/latest.json")
    print(f"  Live download: https://ukapi.cc/downloads/Mowan-Agent-Setup-latest.exe")
    print("=" * 50)

if __name__ == "__main__":
    v = sys.argv[1] if len(sys.argv) > 1 else None
    upload_release(v)
