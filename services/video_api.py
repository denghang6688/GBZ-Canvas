"""Video generation service API boundary for the smart canvas."""

from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException


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
        return await generate_handler(typed_payload)
    generate.__annotations__["payload"] = payload_model
    router.add_api_route("/generate", generate, methods=["POST"])

    return router
