"""Image generation service API boundary for the smart canvas."""

from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException


def build_router(
    online_handler: Callable[[Any], Awaitable[Any]],
    create_task_handler: Callable[[Any], Awaitable[Any]],
    get_task_handler: Callable[[str], Awaitable[Any]],
    query_task_handler: Callable[[Any], Awaitable[Any]],
    online_model: Callable[[Any], Any],
    query_model: Callable[[Any], Any],
) -> APIRouter:
    """Build the image-only router from application-owned service handlers."""
    router = APIRouter(prefix="/api/image", tags=["image"])

    async def online(payload: Any):
        try:
            typed_payload = payload if isinstance(payload, online_model) else online_model.model_validate(payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return await online_handler(typed_payload)
    online.__annotations__["payload"] = online_model
    router.add_api_route("/online", online, methods=["POST"])

    async def create_task(payload: Any):
        try:
            typed_payload = payload if isinstance(payload, online_model) else online_model.model_validate(payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return await create_task_handler(typed_payload)
    create_task.__annotations__["payload"] = online_model
    router.add_api_route("/tasks", create_task, methods=["POST"])

    async def get_task(task_id: str):
        return await get_task_handler(task_id)
    router.add_api_route("/tasks/{task_id}", get_task, methods=["GET"])

    async def query_task(payload: Any):
        try:
            typed_payload = payload if isinstance(payload, query_model) else query_model.model_validate(payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return await query_task_handler(typed_payload)
    query_task.__annotations__["payload"] = query_model
    router.add_api_route("/task-query", query_task, methods=["POST"])

    return router
