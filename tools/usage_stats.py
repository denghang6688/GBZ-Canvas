#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GBZ 画布使用量统计（按「检查更新」链路计）。

原理
----
画布每次启动，后端都会请求魔搭创空间仓库里的 VERSION 文件（main.py 的
/api/check-update）。这类文件 API 请求会计入创空间的 Visits 统计，所以
Visits 的日增量 ≈ 当日打开画布的会话数。这是当前唯一不需要改动产品
代码就能拿到的使用量信号。

局限（读数前务必知道）
----
- Visits 是「访问会话」计数，不是人数：同一 IP 短时间多次请求合并计 1。
- 它同时包含在线版的页面访问，两者无法拆分。
- UniqueVisitors 是「累计去重访客」，只能算每日新增，算不出当日活跃。
- 魔搭不提供趋势接口（/statistics、/visits 均 404），趋势只能靠本脚本
  每天快照攒出来。

用法
----
    python tools/usage_stats.py            抓一次并写入 data/usage_stats.csv
    python tools/usage_stats.py --report   只读本地历史出报告，不联网
"""
import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "data", "usage_stats.csv")
MAIN_PY = os.path.join(ROOT, "main.py")
API = "https://www.modelscope.cn/api/v1/studio/{account}/{repo}"
FIELDS = ["date", "visits", "unique_visitors", "stars", "captured_at"]


def resolve_space():
    """从 main.py 读取创空间标识，避免账号名在两处各写一份。"""
    account, repo = "hans186", "GBZ-Canvas"
    try:
        with open(MAIN_PY, encoding="utf-8") as f:
            text = f.read()
        m = re.search(r'MODELSCOPE_ACCOUNT\s*=\s*["\']([^"\']+)["\']', text)
        if m:
            account = m.group(1)
        m = re.search(r'MODELSCOPE_REPO_NAME\s*=\s*["\']([^"\']+)["\']', text)
        if m:
            repo = m.group(1)
    except OSError:
        pass
    return account, repo


def fetch_stats(account, repo, timeout=15):
    url = API.format(account=account, repo=repo)
    req = urllib.request.Request(url, headers={"User-Agent": "GBZ-UsageStats/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8", "replace"))
    data = payload.get("Data") or {}
    if data.get("Visits") is None or data.get("UniqueVisitors") is None:
        raise RuntimeError("接口未返回统计数据：" + str(payload)[:200])
    return {
        "date": date.today().isoformat(),
        "visits": int(data["Visits"]),
        "unique_visitors": int(data["UniqueVisitors"]),
        "stars": int(data.get("Stars") or 0),
        "captured_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def load_rows():
    if not os.path.isfile(CSV_PATH):
        return []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r.get("date")]
    for r in rows:
        for k in ("visits", "unique_visitors", "stars"):
            try:
                r[k] = int(float(r.get(k) or 0))
            except ValueError:
                r[k] = 0
    rows.sort(key=lambda r: r["date"])
    return rows


def save_rows(rows):
    os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for r in rows:
            writer.writerow({k: r[k] for k in FIELDS})


def upsert(rows, snap):
    """同一天多次运行只保留最后一次快照（累计值最大、最接近当日结束）。"""
    rows = [r for r in rows if r["date"] != snap["date"]]
    rows.append(snap)
    rows.sort(key=lambda r: r["date"])
    return rows


def signed(n):
    return f"+{n}" if n >= 0 else str(n)


def report(rows):
    if not rows:
        print("还没有任何快照数据。先运行一次：python tools/usage_stats.py")
        return
    last = rows[-1]
    print("GBZ 画布使用量（按「检查更新」链路统计）")
    print("=" * 44)
    print(f"累计 · 截至 {last['date']}")
    print(f"  访问会话（Visits）    {last['visits']:,}")
    print(f"  独立访客（累计去重）  {last['unique_visitors']:,}")
    print(f"  收藏                  {last['stars']:,}")

    if len(rows) < 2:
        print("\n这是第一份快照，明天再跑一次就能算出增量。")
        return

    prev = rows[-2]
    dv = last["visits"] - prev["visits"]
    du = last["unique_visitors"] - prev["unique_visitors"]
    print(f"\n较上次快照（{prev['date']}）")
    print(f"  访问会话增量          {signed(dv)}")
    print(f"  新增访客              {signed(du)}")
    if du > 0:
        print(f"  人均会话              {dv / du:.1f}")

    recent = rows[-8:]
    if len(recent) >= 2:
        print(f"\n近 {len(recent) - 1} 天")
        print("  日期          会话增量   新增访客")
        for i in range(1, len(recent)):
            cur, pre = recent[i], recent[i - 1]
            print(
                f"  {cur['date']}  {signed(cur['visits'] - pre['visits']):>9}"
                f"  {signed(cur['unique_visitors'] - pre['unique_visitors']):>9}"
            )

    print("\n口径提醒")
    print("  Visits 含在线版页面访问与所有客户端的自动更新检查，无法拆分；")
    print("  同一 IP 短时多次请求合并计 1，故它是「会话数」而非「人数」。")
    print("  本脚本每次运行自身也是一次 API 请求，会让 Visits +1，读数时可忽略。")


def main():
    ap = argparse.ArgumentParser(description="统计 GBZ 画布使用量（按更新检查链路）")
    ap.add_argument("--report", action="store_true", help="只读本地历史，不联网抓取")
    args = ap.parse_args()

    rows = load_rows()
    if not args.report:
        account, repo = resolve_space()
        try:
            snap = fetch_stats(account, repo)
        except Exception as exc:
            print(f"抓取失败：{exc}")
            print("已保留本地历史，本次未写入新数据。")
            report(rows)
            return 1
        rows = upsert(rows, snap)
        save_rows(rows)
        print(
            f"已记录 {snap['date']}：Visits={snap['visits']} "
            f"Unique={snap['unique_visitors']} → {os.path.relpath(CSV_PATH, ROOT)}\n"
        )

    report(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
