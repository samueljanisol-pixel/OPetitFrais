#!/usr/bin/env python3
"""
Installation légère sur Raspberry Pi (Pi Zero W compatible).

Mode recommandé : cron + curl vers l’API /api/supabase/sync/run (pas de Node, pas de uvloop).

Usage (sur le Pi, en root ou avec sudo) :
  sudo python3 install.py \\
    --url https://VOTRE-APP.vercel.app/api/supabase/sync/run \\
    --token VOTRE_CRON_SECRET

Test manuel après install :
  sudo /usr/local/bin/opf-sync-remote.sh
  tail -f /var/log/o-petit-frais/sync-$(date +%Y%m%d).log
"""

from __future__ import annotations

import argparse
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REMOTE_SH = SCRIPT_DIR / "sync-remote.sh"
INSTALLED_SH = Path("/usr/local/bin/opf-sync-remote.sh")
ENV_FILE = Path("/etc/o-petit-frais-sync.env")
LOG_DIR = Path("/var/log/o-petit-frais")
CRON_FILE = Path("/etc/cron.d/o-petit-frais-sync")


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(cmd))
    return subprocess.run(cmd, check=check, text=True)


def need_root() -> None:
    if os.geteuid() != 0:
        print("Relancez avec sudo : sudo python3 install.py ...", file=sys.stderr)
        sys.exit(1)


def ensure_swap_mb(target_mb: int = 1024) -> None:
    """Augmente le swap si la RAM est faible (Pi Zero W : 512 Mo)."""
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            meminfo = f.read()
    except OSError:
        return
    if "SwapTotal:" not in meminfo:
        return
    swap_kb = 0
    for line in meminfo.splitlines():
        if line.startswith("SwapTotal:"):
            swap_kb = int(line.split()[1])
            break
    if swap_kb >= target_mb * 1024 * 0.9:
        print(f"Swap déjà ~{swap_kb // 1024} Mo, OK.")
        return
    conf = Path("/etc/dphys-swapfile")
    if not conf.is_file():
        print("dphys-swapfile absent : configurez le swap manuellement si besoin.")
        return
    text = conf.read_text(encoding="utf-8")
    if "CONF_SWAPSIZE=" in text:
        import re

        text = re.sub(r"^CONF_SWAPSIZE=.*$", f"CONF_SWAPSIZE={target_mb}", text, flags=re.M)
    else:
        text += f"\nCONF_SWAPSIZE={target_mb}\n"
    conf.write_text(text, encoding="utf-8")
    run(["systemctl", "enable", "dphys-swapfile"], check=False)
    run(["systemctl", "restart", "dphys-swapfile"], check=False)
    print(f"Swap cible {target_mb} Mo (dphys-swapfile).")


def apt_packages() -> None:
    if not shutil.which("apt-get"):
        print("apt-get introuvable : installez curl et cron vous-même.")
        return
    run(["apt-get", "update"])
    run(
        [
            "apt-get",
            "install",
            "-y",
            "--no-install-recommends",
            "curl",
            "cron",
            "ca-certificates",
        ],
    )
    run(["systemctl", "enable", "--now", "cron"], check=False)


def write_env(url: str, token: str) -> None:
    content = f"""# O' Petit Frais — cron sync (généré par install.py)
OPF_SYNC_URL={url}
OPF_SYNC_TOKEN={token}
OPF_SYNC_ENV={ENV_FILE}
OPF_SYNC_LOG_DIR={LOG_DIR}
"""
    ENV_FILE.write_text(content, encoding="utf-8")
    os.chmod(ENV_FILE, stat.S_IRUSR | stat.S_IWUSR)  # 600 root


def install_script() -> None:
    if not REMOTE_SH.is_file():
        print(f"Fichier manquant : {REMOTE_SH}", file=sys.stderr)
        sys.exit(1)
    shutil.copy2(REMOTE_SH, INSTALLED_SH)
    os.chmod(
        INSTALLED_SH,
        stat.S_IRWXU | stat.S_IRGRP | stat.S_IROTH,  # 755
    )


def install_cron(schedule: str, user: str) -> None:
    line = f"{schedule} {user} {INSTALLED_SH}\n"
    CRON_FILE.write_text(
        "# O' Petit Frais — synchro FTP → Supabase (curl vers l’app)\n"
        "SHELL=/bin/sh\n"
        "PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n"
        + line,
        encoding="utf-8",
    )
    os.chmod(CRON_FILE, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP)  # 644
    run(["systemctl", "restart", "cron"], check=False)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Installe le cron de synchro O' Petit Frais sur Raspberry Pi (sans uvloop / sans pip lourd).",
    )
    parser.add_argument(
        "--url",
        required=True,
        help="URL complète ex. https://xxx.vercel.app/api/supabase/sync/run",
    )
    parser.add_argument(
        "--token",
        required=True,
        help="Valeur de CRON_SECRET ou SYNC_TOKEN (identique à .env sur Vercel)",
    )
    parser.add_argument(
        "--schedule",
        default="*/15 * * * *",
        help="Expression cron (défaut : toutes les 15 min)",
    )
    parser.add_argument(
        "--user",
        default="root",
        help="Utilisateur cron (défaut : root)",
    )
    parser.add_argument(
        "--skip-swap",
        action="store_true",
        help="Ne pas toucher au swap",
    )
    args = parser.parse_args()

    need_root()

    print("=== O' Petit Frais — install Pi (mode curl, sans uvloop) ===")
    print("Matériel cible : Raspberry Pi Zero W et plus.")

    apt_packages()
    if not args.skip_swap:
        ensure_swap_mb(1024)

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    write_env(args.url.strip(), args.token.strip())
    install_script()
    install_cron(args.schedule.strip(), args.user.strip())

    print()
    print("Installation terminée.")
    print(f"  Config : {ENV_FILE}")
    print(f"  Script : {INSTALLED_SH}")
    print(f"  Cron   : {CRON_FILE} ({args.schedule})")
    print(f"  Logs   : {LOG_DIR}/sync-YYYYMMDD.log")
    print()
    print("Test :")
    print(f"  sudo {INSTALLED_SH}")
    print(f"  tail -20 {LOG_DIR}/sync-$(date +%Y%m%d).log   # sur le Pi")


if __name__ == "__main__":
    main()
