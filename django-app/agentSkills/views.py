from __future__ import annotations

import json

from django.http import HttpRequest, HttpResponseNotAllowed, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .skills.sceneLayoutSkill.sceneLayout_skill import build_scene_layout_from_json
from .skills.sceneUnderstandSkill.sceneUnderstand_skill import (
	SCENE_UNDERSTAND_MODEL_OPTIONS,
	DEFAULT_SCENE_UNDERSTAND_MODEL,
	run_scene_understand,
	stream_scene_understand,
)
from .skills.sceneUnderstandSkill.sceneLighting_skill import (
	SCENE_LIGHTING_MODEL_OPTIONS,
	DEFAULT_SCENE_LIGHTING_MODEL,
	run_scene_lighting,
	stream_scene_lighting,
)
from .unreal_export import create_job, get_job, get_next_job, get_session, heartbeat_session, list_sessions, register_session, update_job_status
from dwebapp.ai.api.chat.utils import _apply_sse_headers, _sse


@api_view(['GET'])
def scene_understand_models(request: Request) -> Response:
	return Response(
		{
			'ok': True,
			'models': SCENE_UNDERSTAND_MODEL_OPTIONS,
			'defaultModel': DEFAULT_SCENE_UNDERSTAND_MODEL,
		}
	)


@api_view(['GET'])
def scene_lighting_models(request: Request) -> Response:
	return Response(
		{
			'ok': True,
			'models': SCENE_LIGHTING_MODEL_OPTIONS,
			'defaultModel': DEFAULT_SCENE_LIGHTING_MODEL,
		}
	)


@csrf_exempt
@api_view(['POST'])
def scene_understand_run(request: Request) -> Response:
	payload = request.data if isinstance(request.data, dict) else {}
	result = run_scene_understand(
		node_id=str(payload.get('nodeId') or '').strip(),
		model=str(payload.get('model') or '').strip(),
		prompt_text=str(payload.get('promptText') or '').strip(),
		image_url=str(payload.get('imageUrl') or '').strip(),
		image_data_url=str(payload.get('imageDataUrl') or '').strip(),
		image_inputs=payload.get('imageInputs'),
	)
	status = 200 if result.get('ok') else int(result.get('status') or 400)
	return Response(result, status=status)


@csrf_exempt
def scene_understand_run_stream(request: HttpRequest):
	if request.method != 'POST':
		return HttpResponseNotAllowed(['POST'])

	try:
		raw = request.body.decode('utf-8') if request.body else ''
		data = json.loads(raw) if raw else {}
	except Exception:
		data = {}

	payload = data if isinstance(data, dict) else {}

	def gen():
		for message in stream_scene_understand(
			node_id=str(payload.get('nodeId') or '').strip(),
			model=str(payload.get('model') or '').strip(),
			prompt_text=str(payload.get('promptText') or '').strip(),
			image_url=str(payload.get('imageUrl') or '').strip(),
			image_data_url=str(payload.get('imageDataUrl') or '').strip(),
			image_inputs=payload.get('imageInputs'),
		):
			yield _sse('msg', message).encode('utf-8')
		yield _sse('done', '{}').encode('utf-8')

	resp = StreamingHttpResponse(gen(), content_type='text/event-stream')
	_apply_sse_headers(resp)
	return resp


@csrf_exempt
@api_view(['POST'])
def scene_lighting_run(request: Request) -> Response:
	payload = request.data if isinstance(request.data, dict) else {}
	result = run_scene_lighting(
		node_id=str(payload.get('nodeId') or '').strip(),
		model=str(payload.get('model') or '').strip(),
		prompt_text=str(payload.get('promptText') or '').strip(),
		layout_json=str(payload.get('layoutJson') or '').strip(),
		image_url=str(payload.get('imageUrl') or '').strip(),
		image_data_url=str(payload.get('imageDataUrl') or '').strip(),
		image_inputs=payload.get('imageInputs'),
	)
	status = 200 if result.get('ok') else int(result.get('status') or 400)
	return Response(result, status=status)


@csrf_exempt
def scene_lighting_run_stream(request: HttpRequest):
	if request.method != 'POST':
		return HttpResponseNotAllowed(['POST'])

	try:
		raw = request.body.decode('utf-8') if request.body else ''
		data = json.loads(raw) if raw else {}
	except Exception:
		data = {}

	payload = data if isinstance(data, dict) else {}

	def gen():
		for message in stream_scene_lighting(
			node_id=str(payload.get('nodeId') or '').strip(),
			model=str(payload.get('model') or '').strip(),
			prompt_text=str(payload.get('promptText') or '').strip(),
			layout_json=str(payload.get('layoutJson') or '').strip(),
			image_url=str(payload.get('imageUrl') or '').strip(),
			image_data_url=str(payload.get('imageDataUrl') or '').strip(),
			image_inputs=payload.get('imageInputs'),
		):
			yield _sse('msg', message).encode('utf-8')
		yield _sse('done', '{}').encode('utf-8')

	resp = StreamingHttpResponse(gen(), content_type='text/event-stream')
	_apply_sse_headers(resp)
	return resp


@csrf_exempt
@api_view(['POST'])
def scene_layout_run(request: Request) -> Response:
	payload = request.data if isinstance(request.data, dict) else {}
	input_json = str(payload.get('inputJson') or '').strip()
	if not input_json:
		return Response({'ok': False, 'error': 'inputJson is required'}, status=400)

	try:
		parsed = json.loads(input_json)
	except Exception as exc:
		return Response({'ok': False, 'error': f'inputJson is not valid JSON: {exc}'}, status=400)

	result = build_scene_layout_from_json(parsed, node_id=str(payload.get('nodeId') or '').strip())
	status = 200 if result.get('ok') else 400
	return Response(result, status=status)


@csrf_exempt
@api_view(['GET'])
def unreal_export_sessions(request: Request) -> Response:
	result = list_sessions()
	return Response(result, status=200 if result.get('ok') else int(result.get('status') or 400))


@csrf_exempt
@api_view(['POST'])
def unreal_export_register(request: Request) -> Response:
	payload = request.data if isinstance(request.data, dict) else {}
	result = register_session(payload)
	return Response(result, status=200 if result.get('ok') else int(result.get('status') or 400))


@csrf_exempt
@api_view(['GET'])
def unreal_export_session_detail(request: Request, session_id: str) -> Response:
	result = get_session(session_id)
	return Response(result, status=200 if result.get('ok') else int(result.get('status') or 400))


@csrf_exempt
@api_view(['POST'])
def unreal_export_session_heartbeat(request: Request, session_id: str) -> Response:
	result = heartbeat_session(session_id)
	return Response(result, status=200 if result.get('ok') else int(result.get('status') or 400))


@csrf_exempt
@api_view(['POST'])
def unreal_export_create_job(request: Request) -> Response:
	payload = request.data if isinstance(request.data, dict) else {}
	result = create_job(payload)
	return Response(result, status=200 if result.get('ok') else int(result.get('status') or 400))


@csrf_exempt
@api_view(['GET'])
def unreal_export_job_detail(request: Request, job_id: str) -> Response:
	result = get_job(job_id)
	return Response(result, status=200 if result.get('ok') else int(result.get('status') or 400))


@csrf_exempt
@api_view(['GET'])
def unreal_export_next_job(request: Request, session_id: str) -> Response:
	result = get_next_job(session_id)
	return Response(result, status=200 if result.get('ok') else int(result.get('status') or 400))


@csrf_exempt
@api_view(['POST'])
def unreal_export_update_job(request: Request, job_id: str) -> Response:
	payload = request.data if isinstance(request.data, dict) else {}
	result = update_job_status(job_id, payload)
	return Response(result, status=200 if result.get('ok') else int(result.get('status') or 400))
