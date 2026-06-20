from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from django.http import Http404, HttpRequest, HttpResponse, HttpResponseNotAllowed, JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt

from dwebapp.ai.api.chat.utils import _apply_sse_headers

from .models import ChatMessage, ChatSession
from .services import CodexOrchestrator

orchestrator = CodexOrchestrator()
logger = logging.getLogger("codex_bridge")


def health_check(request: HttpRequest) -> JsonResponse | HttpResponse:
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])
    provider = _provider_from_request(request)
    bridge = orchestrator.copilot_bridge if provider == "copilot-cli" else orchestrator.codex_bridge
    health = bridge.health_check()
    logger.info(
        "health_check provider=%s configured=%s reachable=%s",
        provider,
        bool(health.get("configured")),
        bool(health.get("reachable")),
    )
    return JsonResponse(
        {
            "ok": True,
            "provider": provider,
            "configured": bool(health.get("configured")),
            "reachable": bool(health.get("reachable")),
            "payload": health.get("payload") if isinstance(health.get("payload"), dict) else {},
            "error": health.get("error", ""),
        }
    )


def workspace_references(request: HttpRequest) -> JsonResponse | HttpResponse:
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])
    query = request.GET.get("q", "").strip().lower()
    limit_raw = request.GET.get("limit", "12").strip()
    try:
        limit = max(1, min(int(limit_raw), 30))
    except ValueError:
        limit = 12

    provider = _provider_from_request(request)
    bridge = orchestrator.copilot_bridge if provider == "copilot-cli" else orchestrator.codex_bridge
    root = Path(bridge.config.workspace_root)
    if not root.exists() or not root.is_dir():
        return JsonResponse({"items": [], "root": str(root), "error": "workspace root is unavailable"})

    items: list[dict[str, str]] = []
    for path in root.rglob("*"):
        rel = path.relative_to(root).as_posix()
        if not query or query in rel.lower() or query in path.name.lower():
            items.append(
                {
                    "path": rel,
                    "name": path.name,
                    "kind": "directory" if path.is_dir() else "file",
                }
            )
            if len(items) >= limit:
                break
    logger.info("workspace_references query=%r limit=%s matched=%s", query, limit, len(items))
    return JsonResponse({"items": items, "root": str(root)})


@csrf_exempt
def sessions_collection(request: HttpRequest) -> JsonResponse | HttpResponse:
    if request.method == "GET":
        project_id = _coerce_project_id(request.GET.get("projectId"))
        provider = _provider_from_request(request)
        qs = ChatSession.objects.filter(archived_at__isnull=True)
        qs = qs.filter(provider=provider)
        if project_id is None:
            qs = qs.filter(project_id__isnull=True)
        else:
            qs = qs.filter(project_id=project_id)
        sessions = [serialize_session(s) for s in qs[:50]]
        logger.info("sessions_list provider=%s project_id=%s count=%s", provider, project_id, len(sessions))
        return JsonResponse({"items": sessions})

    if request.method == "POST":
            payload = parse_json_body(request)
            provider = _provider_from_request(request)
            project_id = _coerce_project_id(payload.get("projectId"))
            if project_id is None:
                return JsonResponse({"error": "projectId is required"}, status=400)
            title = str(payload.get("title", "")).strip()
            cwd = str(payload.get("cwd", "")).strip()
            model = str(payload.get("model", "")).strip()
            try:
                session = orchestrator.create_session(title=title, cwd=cwd, model=model, project_id=project_id, provider=provider)
            except RuntimeError as exc:
                logger.exception("session_create_failed project_id=%s model=%s", project_id, model)
                error_text = str(exc)
                if "not found" in error_text.lower() or "command not found" in error_text.lower():
                    install_hint = ""
                    if provider == "copilot-cli":
                        install_hint = " 请先安装 GitHub Copilot CLI：运行 `npm install -g @githubnext/copilot-cli`，然后运行 `copilot login` 登录。"
                    return JsonResponse({"error": error_text + install_hint}, status=503)
                return JsonResponse({"error": error_text}, status=503)
            except Exception as exc:
                logger.exception("session_create_failed project_id=%s model=%s", project_id, model)
                return JsonResponse({"error": str(exc)}, status=503)
            logger.info("session_created id=%s project_id=%s model=%s", session.id, project_id, session.model_name)
            return JsonResponse(serialize_session(session), status=201)

    return HttpResponseNotAllowed(["GET", "POST"])


@csrf_exempt
def session_detail(request: HttpRequest, session_id: str) -> JsonResponse | HttpResponse:
    provider = _provider_from_request(request)
    project_id = _coerce_project_id(request.GET.get("projectId"))
    if request.method in {"PATCH", "DELETE"}:
        payload = parse_json_body(request)
        project_id = _coerce_project_id(payload.get("projectId"), project_id)
    session = get_session_or_404(session_id, project_id, provider)
    if request.method == "GET":
        return JsonResponse(serialize_session(session, include_messages=True))
    if request.method == "PATCH":
        payload = parse_json_body(request)
        title = payload.get("title")
        if isinstance(title, str):
            session.title = title.strip()
            session.save(update_fields=["title", "updated_at"])
            logger.info("session_renamed id=%s project_id=%s", session.id, session.project_id)
        return JsonResponse(serialize_session(session, include_messages=True))
    if request.method == "DELETE":
        session.archived_at = session.archived_at or session.updated_at
        session.status = ChatSession.Status.CLOSED
        session.save(update_fields=["archived_at", "status", "updated_at"])
        logger.info("session_archived id=%s project_id=%s", session.id, session.project_id)
        return JsonResponse({"status": "archived", "id": str(session.id)})
    return HttpResponseNotAllowed(["GET", "PATCH", "DELETE"])


@csrf_exempt
def session_messages(request: HttpRequest, session_id: str) -> JsonResponse | HttpResponse:
    provider = _provider_from_request(request)
    project_id = _coerce_project_id(request.GET.get("projectId"))
    session = get_session_or_404(session_id, project_id, provider)
    if request.method == "GET":
        items = [serialize_message(m) for m in ChatMessage.objects.filter(session=session)]
        logger.info("session_messages id=%s project_id=%s count=%s", session.id, session.project_id, len(items))
        return JsonResponse({"items": items})
    return HttpResponseNotAllowed(["GET"])


@csrf_exempt
def session_message_stream(request: HttpRequest, session_id: str) -> StreamingHttpResponse | JsonResponse | HttpResponse:
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    provider = _provider_from_request(request)
    session = get_session_or_404(session_id)
    if provider == "copilot-cli" and str(session.provider or "").strip().lower() != "copilot-cli":
        session.provider = "copilot-cli"
        session.save(update_fields=["provider", "updated_at"])
        logger.info("session_provider_upgraded id=%s project_id=%s from=%s to=%s", session.id, session.project_id, "codex", "copilot-cli")
    elif provider != "copilot-cli" and str(session.provider or "").strip().lower() != "codex":
        return JsonResponse({"error": "session provider mismatch"}, status=403)

    payload = parse_json_body(request)
    project_id = _coerce_project_id(payload.get("projectId"))
    if project_id is None:
        return JsonResponse({"error": "projectId is required"}, status=400)
    if session.project_id != project_id:
        return JsonResponse({"error": "session does not belong to project"}, status=403)
    content = str(payload.get("content", "")).strip()
    refs = parse_workspace_reference_payload(payload.get("references"))
    skill_hints = _coerce_string_list(payload.get("skillHints"))
    execution_hints = _coerce_string_list(payload.get("executionHints"))
    agent_mode = _coerce_agent_mode(payload.get("agentMode"))
    permission_profile = str(payload.get("permissionProfile", "default")).strip() or "default"
    if not content:
        return JsonResponse({"error": "content is required"}, status=400)

    use_mock_stream = _coerce_bool(payload.get("mockSse")) or _coerce_bool(payload.get("mock_sse"))

    logger.info(
        "stream_start session_id=%s project_id=%s refs=%s skill_hints=%s execution_hints=%s",
        session.id,
        project_id,
        len(refs),
        len(skill_hints),
        len(execution_hints),
    )

    response = StreamingHttpResponse(
        (
            chunk.encode("utf-8")
            for chunk in (
                orchestrator.stream_message_mock(
                    session,
                    content,
                    references=refs,
                    skill_hints=skill_hints,
                    execution_hints=execution_hints,
                )
                if use_mock_stream
                else orchestrator.stream_message(
                    session,
                    content,
                    references=refs,
                    skill_hints=skill_hints,
                    execution_hints=execution_hints,
                    agent_mode=agent_mode,
                    permission_profile=permission_profile,
                )
            )
        ),
        content_type="text/event-stream",
    )
    _apply_sse_headers(response)
    return response


@csrf_exempt
def session_message_stream_test(request: HttpRequest, session_id: str) -> StreamingHttpResponse | JsonResponse | HttpResponse:
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    provider = _provider_from_request(request)
    session = get_session_or_404(session_id, expected_provider=provider)
    payload = parse_json_body(request)
    project_id = _coerce_project_id(payload.get("projectId"))
    if project_id is None:
        return JsonResponse({"error": "projectId is required"}, status=400)
    if session.project_id != project_id:
        return JsonResponse({"error": "session does not belong to project"}, status=403)
    content = str(payload.get("content", "")).strip()
    refs = parse_workspace_reference_payload(payload.get("references"))
    skill_hints = _coerce_string_list(payload.get("skillHints"))
    execution_hints = _coerce_string_list(payload.get("executionHints"))
    if not content:
        return JsonResponse({"error": "content is required"}, status=400)

    logger.info(
        "stream_test_start session_id=%s project_id=%s refs=%s skill_hints=%s execution_hints=%s",
        session.id,
        project_id,
        len(refs),
        len(skill_hints),
        len(execution_hints),
    )

    response = StreamingHttpResponse(
        (
            chunk.encode("utf-8")
            for chunk in orchestrator.stream_message_mock(
                session,
                content,
                references=refs,
                skill_hints=skill_hints,
                execution_hints=execution_hints,
            )
        ),
        content_type="text/event-stream",
    )
    _apply_sse_headers(response)
    return response


@csrf_exempt
def session_approvals(request: HttpRequest, session_id: str) -> JsonResponse | HttpResponse:
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    provider = _provider_from_request(request)
    session = get_session_or_404(session_id, expected_provider=provider)
    payload = parse_json_body(request)
    project_id = _coerce_project_id(payload.get("projectId"))
    if project_id is None:
        return JsonResponse({"error": "projectId is required"}, status=400)
    if session.project_id != project_id:
        return JsonResponse({"error": "session does not belong to project"}, status=403)
    message_id = str(payload.get("message_id", "")).strip()
    decision = str(payload.get("decision", "")).strip()
    if not message_id or not decision:
        return JsonResponse({"error": "message_id and decision are required"}, status=400)

    try:
        message = orchestrator.submit_approval(session, message_id, decision)
    except RuntimeError as exc:
        logger.warning("approval_rejected session_id=%s message_id=%s decision=%s error=%s", session.id, message_id, decision, exc)
        return JsonResponse({"error": str(exc)}, status=400)
    except Exception as exc:
        logger.exception("approval_failed session_id=%s message_id=%s decision=%s", session.id, message_id, decision)
        return JsonResponse({"error": str(exc)}, status=503)

    logger.info("approval_submitted session_id=%s message_id=%s decision=%s", session.id, message_id, decision)

    return JsonResponse({"message": serialize_message(message)})


def get_session_or_404(session_id: str, project_id: int | None = None, expected_provider: str | None = None) -> ChatSession:
    try:
        qs = ChatSession.objects.filter(pk=session_id)
        if project_id is not None:
            qs = qs.filter(project_id=project_id)
        if expected_provider:
            qs = qs.filter(provider=expected_provider)
        return qs.get()
    except ChatSession.DoesNotExist as exc:
        raise Http404("session not found") from exc


def parse_json_body(request: HttpRequest) -> dict[str, Any]:
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return {}


def parse_workspace_reference_payload(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path", "")).strip()
        if not path:
            continue
        items.append(
            {
                "path": path,
                "name": str(item.get("name", "")).strip(),
                "kind": str(item.get("kind", "")).strip() or "file",
            }
        )
    return items


def _coerce_project_id(value: Any, fallback: int | None = None) -> int | None:
    if value is None or value == "":
        return fallback
    try:
        return int(str(value).strip())
    except Exception:
        return fallback


def _coerce_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item or "").strip()
        if text:
            out.append(text)
    return out


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    return text in {"1", "true", "yes", "on"}


def _coerce_agent_mode(value: Any) -> str:
    text = str(value or "agent").strip().lower()
    if text in {"ask", "plan"}:
        return text
    return "agent"


def _provider_from_request(request: HttpRequest) -> str:
    path = str(getattr(request, "path", "") or "").lower()
    if "/workflow/copilot/" in path:
        return "copilot-cli"
    return "codex"


def serialize_session(session: ChatSession, include_messages: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": str(session.id),
        "title": session.title,
        "provider": session.provider,
        "model_name": session.model_name,
        "status": session.status,
        "provider_thread_id": session.provider_thread_id,
        "project_id": session.project_id,
        "cwd": session.cwd,
        "approval_policy": session.approval_policy,
        "last_turn_status": session.last_turn_status,
        "sandbox_policy": session.sandbox_policy,
        "metadata": session.metadata,
        "archived_at": session.archived_at.isoformat() if session.archived_at else None,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
    }
    if include_messages:
        payload["messages"] = [serialize_message(message) for message in ChatMessage.objects.filter(session=session)]
    return payload


def serialize_message(message: ChatMessage) -> dict[str, Any]:
    return {
        "id": str(message.id),
        "session_id": str(message.session.id),
        "role": message.role,
        "content": message.content,
        "status": message.status,
        "item_type": message.item_type,
        "stream_phase": message.stream_phase,
        "tool_name": message.tool_name,
        "provider_item_id": message.provider_item_id,
        "command": message.command,
        "file_changes": message.file_changes,
        "approval_request": message.approval_request,
        "usage": message.usage,
        "provider_message_id": message.provider_message_id,
        "provider_payload": message.provider_payload,
        "error_message": message.error_message,
        "created_at": message.created_at.isoformat(),
        "updated_at": message.updated_at.isoformat(),
    }
