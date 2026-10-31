#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GBZ智能画布 一键发布新版本

用法（在项目根目录执行）：
  python tools/publish_release.py                      # 自动用当前时间生成版本号，交互输入更新说明
  python tools/publish_release.py -v 2026.10.01.120000 -n "新增 XX 功能"
  python tools/publish_release.py --manifest-only      # 只重新生成更新清单，不改版本号
  python tools/publish_release.py --no-push            # 只提交到本地 git，不推送

脚本会做四件事：
  1. 写入新的 VERSION 版本号
  2. 更新 static/update-notes.json（保留历史记录，客户端更新时会显示这些说明）
  3. 重新生成 static/update-manifest.json（魔搭静态空间用清单列举可更新文件）
  4. 提交并推送到魔搭（modelscope）与 GitHub（github）远程仓库
"""

import argparse
import datetime
import filecmp
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION_FILE = os.path.join(ROOT, "VERSION")
NOTES_FILE = os.path.join(ROOT, "static", "update-notes.json")
MANIFEST_FILE = os.path.join(ROOT, "static", "update-manifest.json")
# 2026-10-31：魔搭更新源走的是创空间仓库 clone（tmp/ms_publish，分支 master），
# 主仓库只有 origin/main。之前脚本只认 space/modelscope/github 远端，
# 在这台机器上等于一个都没推成功（魔搭版本停在 V26.10.27.3 就是这么来的）。
MS_PUBLISH_DIR = os.path.join(ROOT, "tmp", "ms_publish")

# 与 main.py 的 update_allowed_file() 保持一致：只允许更新这些文件
ALLOWED_ROOT_FILES = {"main.py", "VERSION"}
ALLOWED_PREFIX = "static/"
SKIP_FILES = {"static/update-manifest.json", "static/.gitkeep"}

# 2026-10-12：清单/仓库必须保持干净——备份(*.bak*/*.rejected*)、临时(tmp-_debug qa-)、
# 缓存(__pycache__/*.pyc)一律不入清单，否则客户端会把这些文件当可更新文件去下载。
SKIP_NAME_PREFIXES = ("tmp-", "tmp_", "_debug", "qa-", "_qa_", "._")
SKIP_SUFFIXES = (".pyc", ".log", ".tmp", ".swp")


def _skip_entry(name: str) -> bool:
    low = str(name or "").lower()
    if not low:
        return True
    if ".bak" in low or "rejected" in low:
        return True
    if low.startswith(SKIP_NAME_PREFIXES):
        return True
    if low.endswith(SKIP_SUFFIXES):
        return True
    return False


def read_text(path, default=""):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return default


def write_text(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def current_version():
    text = read_text(VERSION_FILE).strip().splitlines()
    return text[0].strip() if text else ""


def auto_version():
    return datetime.datetime.now().strftime("%Y.%m.%d.%H%M%S")


def safe_notes(payload):
    if not isinstance(payload, dict):
        return {}
    version = str(payload.get("version") or "").strip()
    items = payload.get("items")
    if not version or not isinstance(items, list):
        return {}
    return {"version": version, "updated_at": str(payload.get("updated_at") or ""), "items": items}


def update_notes(version, note):
    payload = {}
    old = read_text(NOTES_FILE)
    if old.strip():
        try:
            payload = json.loads(old)
        except Exception:
            payload = {}

    old_top = safe_notes(payload)
    history = []
    if old_top.get("version") and old_top["version"] != version:
        history.append(old_top)
    old_history = payload.get("history") if isinstance(payload.get("history"), list) else []
    for item in old_history:
        cleaned = safe_notes(item)
        if cleaned.get("version") and cleaned["version"] != version and all(h["version"] != cleaned["version"] for h in history):
            history.append(cleaned)

    now_text = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    result = {
        "version": version,
        "updated_at": now_text,
        "items": [{"type": "feature", "text": note}],
        "history": history[:30],
    }
    write_text(NOTES_FILE, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def collect_files():
    files = []
    for name in sorted(ALLOWED_ROOT_FILES):
        if os.path.isfile(os.path.join(ROOT, name)):
            files.append(name)
    static_root = os.path.join(ROOT, "static")
    for dirpath, dirnames, filenames in os.walk(static_root):
        dirnames[:] = [d for d in dirnames if d not in {"__pycache__", ".git"} and not _skip_entry(d)]
        for fn in filenames:
            if _skip_entry(fn):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT).replace("\\", "/")
            if rel in SKIP_FILES:
                continue
            if rel.startswith(ALLOWED_PREFIX):
                files.append(rel)
    return sorted(set(files))


def write_manifest(version):
    files = collect_files()
    payload = {
        "version": version,
        "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "count": len(files),
        "files": files,
    }
    write_text(MANIFEST_FILE, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return payload


def run_git(args, check=False):
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    result = subprocess.run(
        ["git"] + args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env
    )
    if result.returncode != 0 and check:
        print(result.stdout)
        print(result.stderr)
        raise SystemExit(f"git {' '.join(args)} 失败")
    return result


def remote_exists(name):
    result = run_git(["remote"])
    return name in (result.stdout or "").split()


def current_branch():
    result = run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    branch = (result.stdout or "").strip()
    return branch if branch and branch != "HEAD" else "main"


def push_with_retry(args, attempts=3):
    """推送统一带 sslBackend=openssl（Windows schannel 常报 server closed）+ 失败重试，
    沙箱/公司代理偶发 502 时直接重试即可，不必改凭据。"""
    last = None
    for i in range(attempts):
        last = run_git(["-c", "http.sslBackend=openssl"] + args)
        if last.returncode == 0:
            return last
        print(f"[git] 第 {i + 1}/{attempts} 次失败：{(last.stderr or '').strip()[:200]}")
    return last


def sync_ms_publish(version):
    """把发布文件同步到魔搭创空间仓库 clone（tmp/ms_publish）并提交推送 master。

    魔搭更新源读的是仓库实时内容，推完即生效；没有这个 clone 时静默跳过。
    """
    if not os.path.isdir(os.path.join(MS_PUBLISH_DIR, ".git")):
        return None
    files = collect_files()
    copied = 0
    for rel in files:
        src = os.path.join(ROOT, rel)
        dst = os.path.join(MS_PUBLISH_DIR, rel)
        if not os.path.isfile(src):
            continue
        if os.path.isfile(dst) and filecmp.cmp(src, dst, shallow=False):
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
    # 清单文件自己在 SKIP_FILES 里（不进清单），但仍要作为兜底文件随仓库发布
    if os.path.isfile(MANIFEST_FILE):
        dst_manifest = os.path.join(MS_PUBLISH_DIR, os.path.relpath(MANIFEST_FILE, ROOT))
        os.makedirs(os.path.dirname(dst_manifest), exist_ok=True)
        shutil.copy2(MANIFEST_FILE, dst_manifest)
    print(f"[魔搭] 同步 {copied} 个文件 → tmp/ms_publish")

    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"

    def git_in_clone(args):
        return subprocess.run(
            ["git"] + args, cwd=MS_PUBLISH_DIR, capture_output=True, text=True,
            encoding="utf-8", errors="replace", env=env,
        )

    git_in_clone(["add", "-A"])
    status = git_in_clone(["status", "--porcelain"])
    if (status.stdout or "").strip():
        commit = git_in_clone([
            "-c", "user.name=GBZ", "-c", "user.email=gbz@users.noreply.github.com",
            "commit", "-m", f"release: {version}",
        ])
        if commit.returncode != 0:
            print(f"[魔搭] 提交失败：{(commit.stderr or '').strip()[:200]}")
            return False
    last = None
    for i in range(3):
        last = git_in_clone(["-c", "http.sslBackend=openssl", "push", "origin", "master"])
        if last.returncode == 0:
            print("[魔搭] 已推送 ms_publish → master ✅")
            return True
        print(f"[魔搭] 第 {i + 1}/3 次推送失败：{(last.stderr or '').strip()[:200]}")
    return False


# 2026-10-12：第三方工作流快照（RunningHub 等）导出的 URL 里会残留临时认证参数，
# 一旦随公开仓库发布即泄露。发布前统一清洗，避免再次发生。
SENSITIVE_PATTERNS = (
    # RunningHub 临时签名 / 用户标识（明文、\u0026 转义、URL 编码三种形态）
    (re.compile(r"(?:&|\\+u0026|%26)Rh-Comfy-Auth(?:=|\\+u003d|%3[dD])[0-9A-Za-z+/]*(?:(?:=|\\+u003d|%3[dD]))*"), ""),
    (re.compile(r"(?:&|\\+u0026|%26)Rh-Identify(?:=|\\+u003d|%3[dD])[0-9a-fA-F]*"), ""),
    # 形如 "Authorization: Bearer eyJ..." 的落盘 token
    (re.compile(r"(?i)authorization[\"']?\s*[:=]\s*[\"']?bearer\s+[A-Za-z0-9._\-]{20,}"), ""),
)
SENSITIVE_SCAN_SUFFIXES = (".json", ".js", ".html", ".css", ".txt", ".md", ".xml", ".yaml", ".yml")


def scrub_sensitive_params():
    """清掉会随工作流快照一起导出的第三方临时认证参数（幂等，可重复执行）。"""
    changed = []
    static_root = os.path.join(ROOT, "static")
    for dirpath, dirnames, filenames in os.walk(static_root):
        dirnames[:] = [d for d in dirnames if d not in {"__pycache__", ".git"}]
        for fn in filenames:
            if not fn.lower().endswith(SENSITIVE_SCAN_SUFFIXES):
                continue
            full = os.path.join(dirpath, fn)
            raw = read_text(full, None)
            if raw is None:
                continue
            new = raw
            for pat, rep in SENSITIVE_PATTERNS:
                new = pat.sub(rep, new)
            if new != raw:
                write_text(full, new)
                changed.append(os.path.relpath(full, ROOT).replace("\\", "/"))
    return changed


def main():
    parser = argparse.ArgumentParser(description="GBZ智能画布 一键发布新版本")
    parser.add_argument("-v", "--version", default="", help="新版本号，留空则用当前时间自动生成")
    parser.add_argument("-n", "--note", default="", help="本次更新说明，留空则交互输入")
    parser.add_argument("--manifest-only", action="store_true", help="只重新生成更新清单，不改版本号")
    parser.add_argument("--no-push", action="store_true", help="只本地提交，不推送到远程仓库")
    args = parser.parse_args()

    version = current_version()

    scrubbed = scrub_sensitive_params()
    if scrubbed:
        print(f"[安全] 已清除工作流快照里的第三方临时认证参数：{', '.join(scrubbed)}")
    else:
        print("[安全] 未发现需清洗的第三方认证参数")

    if args.manifest_only:
        manifest = write_manifest(version)
        print(f"[清单] 已生成 static/update-manifest.json：{manifest['count']} 个文件（版本 {version}）")
    else:
        version = (args.version or "").strip() or auto_version()
        note = (args.note or "").strip()
        if not note:
            try:
                note = input("请输入本次更新说明（客户端会显示）：").strip()
            except EOFError:
                note = ""
        if not note:
            note = "优化体验并修复已知问题。"
        write_text(VERSION_FILE, version + "\n")
        notes = update_notes(version, note)
        manifest = write_manifest(version)
        print(f"[版本] VERSION -> {version}")
        print(f"[说明] 已写入 static/update-notes.json（历史 {len(notes['history'])} 条）")
        print(f"[清单] 已生成 static/update-manifest.json：{manifest['count']} 个文件")

    if not os.path.isdir(os.path.join(ROOT, ".git")):
        print("[git] 当前目录不是 git 仓库，跳过提交。请先执行 git init 并配置远程仓库。")
        return

    run_git(["add", "-A"])
    run_git(["-c", "user.name=GBZ", "-c", "user.email=gbz@users.noreply.github.com",
             "commit", "-m", f"release: {version}" if not args.manifest_only else "chore: refresh update manifest"])

    if args.no_push:
        print("[git] 已本地提交（--no-push，未推送）")
        return

    pushed = []
    # 魔搭更新源 = 创空间仓库 clone（tmp/ms_publish），先同步文件再推 master
    if sync_ms_publish(version):
        pushed.append("ms_publish（魔搭）")
    branch = current_branch()
    for remote in ("origin", "space", "modelscope", "github"):
        if not remote_exists(remote):
            continue
        # 主仓库主分支一般是 main，魔搭创空间仓库固定 master
        target = branch if remote == "origin" else "master"
        result = push_with_retry(["push", remote, target])
        if result.returncode == 0:
            pushed.append(remote)
            print(f"[git] 已推送到 {remote}（{target}）✅")
        else:
            print(f"[git] 推送到 {remote} 失败：{(result.stderr or '').strip()[:200]}")
    if not pushed:
        print("[git] 没有可用的远程仓库（origin / tmp/ms_publish），请先配置 git remote 或克隆魔搭仓库")
        return

    print("\n发布完成！魔搭创空间仓库文件 API 实时生效，无需重新部署。")
    print("用户端将在 60 秒内自动检测到新版本，版本徽章会变绿提示更新。")


if __name__ == "__main__":
    main()
