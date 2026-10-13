"""LLM service API boundary for the smart canvas."""

from typing import Any, Awaitable, Callable

from fastapi import APIRouter, Header, HTTPException, Request


def build_router(
    canvas_handler: Callable[[Any], Awaitable[Any]],
    chat_stream_handler: Callable[[Any, Request, str], Awaitable[Any]],
    canvas_model: Callable[[Any], Any],
    chat_model: Callable[[Any], Any],
) -> APIRouter:
    """Build the LLM-only router from application-owned service handlers."""
    router = APIRouter(prefix="/api/llm", tags=["llm"])

    async def canvas(payload: Any):
        try:
            typed_payload = payload if isinstance(payload, canvas_model) else canvas_model.model_validate(payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return await canvas_handler(typed_payload)
    canvas.__annotations__["payload"] = canvas_model
    router.add_api_route("/canvas", canvas, methods=["POST"])

    async def chat_stream(
        payload: Any,
        request: Request,
        x_user_id: str = Header(default=""),
    ):
        try:
            typed_payload = payload if isinstance(payload, chat_model) else chat_model.model_validate(payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return await chat_stream_handler(typed_payload, request, x_user_id)
    chat_stream.__annotations__["payload"] = chat_model
    router.add_api_route("/chat/stream", chat_stream, methods=["POST"])

    return router
