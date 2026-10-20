"""Video generation service API boundary for the smart canvas."""

from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException

from services.video_jobs import extract_video_urls, recent_video_jobs, record_video_job


def build_router(
    generate_handler: Callable[[Any], Awaitable[Any]],
    payload_model: Callable[[Any], Any],
) -> APIRouter:
    """Build the video-only router from the application-owned handler."""
    router = APIRouter(prefix="/api/video", tags=["video"])

    async def generate(payload: Any):
        try:
            typed_payload = payload if isinstance(payload, payload_model) else payload_model.model_validate(payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        # 2026-10-20 生成结果落库：画布刷新/关页导致长请求 abort 时，
        # 已计费的视频还能从 /api/video/jobs 找回（成功和失败都记）。
        try:
            result = await generate_handler(typed_payload)
        except HTTPException as exc:
            record_video_job(typed_payload, None, exc.detail)
            raise
        except Exception as exc:
            record_video_job(typed_payload, None, str(exc))
            raise
        record_video_job(typed_payload, extract_video_urls(result), None)
        return result
    generate.__annotations__["payload"] = payload_model
    router.add_api_route("/generate", generate, methods=["POST"])

    async def jobs(limit: int = 40, days: int = 7):
        return recent_video_jobs(limit=limit, days=days)
    router.add_api_route("/jobs", jobs, methods=["GET"])

    return router
