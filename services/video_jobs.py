"""视频生成结果落库（2026-10-20）。

背景：/api/video/generate 是阻塞式长请求。用户在生成期间刷新/关闭页面，
浏览器 abort 请求，但后端仍会把视频下载到 assets/output 并正常计费——
结果文件躺在磁盘上，画布节点却永远收不到，用户「花了钱找不到视频」。

方案：每次视频生成结束（成功/失败）都在 data/video_jobs.json 追加一条记录；
新增 GET /api/video/jobs 返回最近记录，并对 assets/output 里没有记录的
历史 mp4 按 mtime 兜底扫描，保证旧文件也能找回。
"""

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STORE_PATH = PROJECT_ROOT / "data" / "video_jobs.json"
ASSETS_OUTPUT_DIR = PROJECT_ROOT / "assets" / "output"
MAX_RECORDS = 500
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v"}


def _load_store() -> List[Dict[str, Any]]:
    try:
        data = json.loads(STORE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_store(records: List[Dict[str, Any]]) -> None:
    try:
        STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STORE_PATH.write_text(
            json.dumps(records[-MAX_RECORDS:], ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
    except Exception:
        pass


def _payload_field(payload: Any, name: str) -> str:
    if payload is None:
        return ""
    if isinstance(payload, dict):
        value = payload.get(name)
    else:
        value = getattr(payload, name, None)
    return str(value or "").strip()


def extract_video_urls(result: Any) -> List[str]:
    """从视频生成结果里尽量多捞本地文件地址（兼容多种返回结构）。"""
    urls: List[str] = []

    def _push(item: Any) -> None:
        url = item.get("url") if isinstance(item, dict) else item
        if isinstance(url, str) and url.strip() and url.strip() not in urls:
            urls.append(url.strip())

    if isinstance(result, dict):
        for key in ("videos", "video_urls", "urls", "images"):
            value = result.get(key)
            if isinstance(value, list):
                for item in value:
                    _push(item)
            elif isinstance(value, str) and value.strip():
                _push(value)
        items = result.get("image_items")
        if isinstance(items, list):
            for item in items:
                _push(item)
        if not urls and isinstance(result.get("url"), str) and result["url"].strip():
            _push(result["url"])
    return urls


def record_video_job(payload: Any = None, urls: Optional[List[str]] = None, error: Any = None) -> None:
    """生成结束（成功或失败）落一条记录；失败也记，方便用户核对扣费。"""
    detail = ""
    if error is not None:
        detail = str(getattr(error, "detail", None) or error or "")
        detail = detail[:500]
    prompt = _payload_field(payload, "prompt").replace("\n", " ")
    record: Dict[str, Any] = {
        "id": f"vj-{int(time.time() * 1000)}",
        "ts": round(time.time(), 3),
        "provider_id": _payload_field(payload, "provider_id"),
        "model": _payload_field(payload, "model"),
        "prompt": prompt[:200],
        "duration": _payload_field(payload, "duration"),
        "aspect_ratio": _payload_field(payload, "aspect_ratio"),
        "resolution": _payload_field(payload, "resolution"),
        "urls": [u for u in (urls or []) if u],
        "error": detail,
    }
    records = _load_store()
    records.append(record)
    _save_store(records)


def recent_video_jobs(limit: int = 40, days: int = 7) -> List[Dict[str, Any]]:
    """最近生成记录；对没有记录的历史文件按 assets/output 扫描兜底。"""
    try:
        limit = max(1, min(100, int(limit)))
    except Exception:
        limit = 40
    try:
        days = max(1, min(90, int(days)))
    except Exception:
        days = 7
    since = time.time() - days * 86400

    jobs: List[Dict[str, Any]] = []
    seen: set = set()
    for record in _load_store():
        ts = float(record.get("ts") or 0)
        if ts < since:
            continue
        for url in record.get("urls") or []:
            if url in seen:
                continue
            seen.add(url)
            path = PROJECT_ROOT / url.lstrip("/") if url.startswith("/") else PROJECT_ROOT / url
            size = 0
            try:
                size = path.stat().st_size if path.exists() else 0
            except Exception:
                pass
            jobs.append({
                "url": url,
                "ts": ts,
                "name": Path(url).name,
                "size": size,
                "prompt": record.get("prompt") or "",
                "model": record.get("model") or "",
                "resolution": record.get("resolution") or "",
                "duration": record.get("duration") or "",
                "error": record.get("error") or "",
            })

    # 兜底：扫描 assets/output 里近 N 天的 mp4，没有记录的（旧文件/老版本生成的）也列出来。
    if ASSETS_OUTPUT_DIR.exists():
        for path in ASSETS_OUTPUT_DIR.iterdir():
            if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
                continue
            try:
                stat = path.stat()
            except Exception:
                continue
            if stat.st_mtime < since:
                continue
            url = f"/assets/output/{path.name}"
            if url in seen:
                continue
            seen.add(url)
            jobs.append({
                "url": url,
                "ts": round(stat.st_mtime, 3),
                "name": path.name,
                "size": stat.st_size,
                "prompt": "",
                "model": "",
                "resolution": "",
                "duration": "",
                "error": "",
            })

    jobs.sort(key=lambda item: item.get("ts") or 0, reverse=True)
    return jobs[:limit]
