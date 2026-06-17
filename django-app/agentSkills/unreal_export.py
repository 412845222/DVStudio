from __future__ import annotations

import threading
import time
import uuid
from typing import Any


SESSION_STALE_SECONDS = 30.0

_lock = threading.RLock()
_sessions_by_id: dict[str, dict[str, Any]] = {}
_jobs_by_id: dict[str, dict[str, Any]] = {}
_job_order: list[str] = []


def _now_ms() -> int:
	return int(time.time() * 1000)


def _now_seconds() -> float:
	return time.time()


def _clone_session(session: dict[str, Any]) -> dict[str, Any]:
	last_seen_at = int(session.get('lastSeenAt') or 0)
	stale = False
	if last_seen_at > 0:
		stale = (_now_ms() - last_seen_at) > int(SESSION_STALE_SECONDS * 1000)
	return {
		'sessionId': session.get('sessionId'),
		'displayName': session.get('displayName') or '',
		'projectName': session.get('projectName') or '',
		'projectPath': session.get('projectPath') or '',
		'saveDirectory': session.get('saveDirectory') or '',
		'assetRootPath': session.get('assetRootPath') or '',
		'pluginVersion': session.get('pluginVersion') or '',
		'engineVersion': session.get('engineVersion') or '',
		'hostName': session.get('hostName') or '',
		'connectedAt': session.get('connectedAt'),
		'lastSeenAt': last_seen_at or None,
		'activeJobId': session.get('activeJobId') or '',
		'status': 'stale' if stale else 'connected',
	}


def _clone_job(job: dict[str, Any], *, include_payload: bool = False) -> dict[str, Any]:
	cloned = {
		'jobId': str(job.get('jobId') or '').strip(),
		'targetSessionId': str(job.get('targetSessionId') or '').strip(),
		'sourceNodeId': str(job.get('sourceNodeId') or '').strip(),
		'sceneName': str(job.get('sceneName') or 'DwebSceneExport').strip() or 'DwebSceneExport',
		'status': str(job.get('status') or 'queued').strip() or 'queued',
		'message': str(job.get('message') or '').strip(),
		'createdAt': int(job.get('createdAt') or 0) or None,
		'updatedAt': int(job.get('updatedAt') or 0) or None,
	}
	result_data = job.get('resultData')
	if isinstance(result_data, dict) and result_data:
		cloned['resultData'] = result_data
	if include_payload:
		cloned['exportPayload'] = job.get('exportPayload') if isinstance(job.get('exportPayload'), dict) else {}
	return cloned


def register_session(payload: dict[str, Any]) -> dict[str, Any]:
	requested_session_id = str(payload.get('sessionId') or '').strip()
	project_path = str(payload.get('projectPath') or '').strip()
	host_name = str(payload.get('hostName') or '').strip()
	project_name = str(payload.get('projectName') or '').strip()
	session_id = requested_session_id
	now = _now_ms()
	with _lock:
		if not session_id:
			for existing_session in _sessions_by_id.values():
				existing_project_path = str(existing_session.get('projectPath') or '').strip()
				existing_host_name = str(existing_session.get('hostName') or '').strip()
				existing_project_name = str(existing_session.get('projectName') or '').strip()
				if project_path and existing_project_path and existing_project_path == project_path:
					if not host_name or not existing_host_name or existing_host_name == host_name:
						session_id = str(existing_session.get('sessionId') or '').strip()
						break
				if not session_id and project_name and existing_project_name == project_name:
					if host_name and existing_host_name and existing_host_name != host_name:
						continue
					session_id = str(existing_session.get('sessionId') or '').strip()
					break
		if not session_id:
			session_id = f"ue-{uuid.uuid4().hex[:16]}"
		session = _sessions_by_id.get(session_id) or {}
		session.update({
			'sessionId': session_id,
			'displayName': str(payload.get('displayName') or payload.get('projectName') or 'Unreal Editor').strip(),
			'projectName': project_name,
			'projectPath': project_path,
			'saveDirectory': str(payload.get('saveDirectory') or '').strip(),
			'assetRootPath': str(payload.get('assetRootPath') or session.get('assetRootPath') or '/Game/DwebWorkflowExports').strip() or '/Game/DwebWorkflowExports',
			'pluginVersion': str(payload.get('pluginVersion') or '').strip(),
			'engineVersion': str(payload.get('engineVersion') or '').strip(),
			'hostName': host_name,
			'connectionToken': str(payload.get('connectionToken') or session.get('connectionToken') or uuid.uuid4().hex),
			'connectedAt': int(session.get('connectedAt') or now),
			'lastSeenAt': now,
			'activeJobId': session.get('activeJobId') or '',
		})
		_sessions_by_id[session_id] = session
		return {
			'ok': True,
			'session': _clone_session(session),
			'heartbeatIntervalMs': 10_000,
			'connectionToken': session.get('connectionToken'),
		}


def heartbeat_session(session_id: str) -> dict[str, Any]:
	key = str(session_id or '').strip()
	if not key:
		return {'ok': False, 'error': 'sessionId is required', 'status': 400}
	with _lock:
		session = _sessions_by_id.get(key)
		if not session:
			return {'ok': False, 'error': 'session not found', 'status': 404}
		session['lastSeenAt'] = _now_ms()
		return {'ok': True, 'session': _clone_session(session)}


def list_sessions() -> dict[str, Any]:
	with _lock:
		sessions = [_clone_session(_sessions_by_id[session_id]) for session_id in sorted(_sessions_by_id.keys())]
		sessions.sort(key=lambda item: int(item.get('lastSeenAt') or 0), reverse=True)
		return {'ok': True, 'sessions': sessions}


def get_session(session_id: str) -> dict[str, Any]:
	key = str(session_id or '').strip()
	if not key:
		return {'ok': False, 'error': 'sessionId is required', 'status': 400}
	with _lock:
		session = _sessions_by_id.get(key)
		if not session:
			return {'ok': False, 'error': 'session not found', 'status': 404}
		return {'ok': True, 'session': _clone_session(session)}


def create_job(payload: dict[str, Any]) -> dict[str, Any]:
	target_session_id = str(payload.get('targetSessionId') or '').strip()
	if not target_session_id:
		return {'ok': False, 'error': 'targetSessionId is required', 'status': 400}
	with _lock:
		session = _sessions_by_id.get(target_session_id)
		if not session:
			return {'ok': False, 'error': 'target session not found', 'status': 404}
		job_id = f"uejob-{uuid.uuid4().hex[:16]}"
		now = _now_ms()
		job = {
			'jobId': job_id,
			'targetSessionId': target_session_id,
			'sourceNodeId': str(payload.get('sourceNodeId') or '').strip(),
			'sceneName': str(payload.get('sceneName') or 'DwebSceneExport').strip(),
			'status': 'queued',
			'message': '等待 Unreal 插件拉取任务',
			'createdAt': now,
			'updatedAt': now,
			'exportPayload': payload.get('exportPayload') if isinstance(payload.get('exportPayload'), dict) else {},
		}
		_jobs_by_id[job_id] = job
		_job_order.append(job_id)
		return {
			'ok': True,
			'job': _clone_job(job),
		}


def get_job(job_id: str) -> dict[str, Any]:
	key = str(job_id or '').strip()
	if not key:
		return {'ok': False, 'error': 'jobId is required', 'status': 400}
	with _lock:
		job = _jobs_by_id.get(key)
		if not job:
			return {'ok': False, 'error': 'job not found', 'status': 404}
		return {'ok': True, 'job': _clone_job(job, include_payload=True)}


def get_next_job(session_id: str) -> dict[str, Any]:
	key = str(session_id or '').strip()
	if not key:
		return {'ok': False, 'error': 'sessionId is required', 'status': 400}
	with _lock:
		session = _sessions_by_id.get(key)
		if not session:
			return {'ok': False, 'error': 'session not found', 'status': 404}
		session['lastSeenAt'] = _now_ms()
		for job_id in _job_order:
			job = _jobs_by_id.get(job_id)
			if not job or job.get('targetSessionId') != key:
				continue
			if job.get('status') != 'queued':
				continue
			job['status'] = 'picked'
			job['message'] = '插件已接收任务，等待导入执行'
			job['updatedAt'] = _now_ms()
			session['activeJobId'] = job_id
			return {
				'ok': True,
				'job': _clone_job(job, include_payload=True),
			}
		return {'ok': True, 'job': None}


def update_job_status(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
	key = str(job_id or '').strip()
	status = str(payload.get('status') or '').strip()
	if not key:
		return {'ok': False, 'error': 'jobId is required', 'status': 400}
	if status not in {'queued', 'picked', 'downloading', 'importing', 'assembling-actor', 'completed', 'failed'}:
		return {'ok': False, 'error': 'invalid status', 'status': 400}
	with _lock:
		job = _jobs_by_id.get(key)
		if not job:
			return {'ok': False, 'error': 'job not found', 'status': 404}
		job['status'] = status
		job['message'] = str(payload.get('message') or job.get('message') or '').strip()
		job['updatedAt'] = _now_ms()
		result_data = payload.get('resultData')
		if isinstance(result_data, dict):
			job['resultData'] = result_data
		session_id = str(job.get('targetSessionId') or '').strip()
		session = _sessions_by_id.get(session_id)
		if session:
			session['lastSeenAt'] = _now_ms()
			if status in {'completed', 'failed'} and session.get('activeJobId') == key:
				session['activeJobId'] = ''
		return {
			'ok': True,
			'job': _clone_job(job),
		}