from __future__ import annotations

import json
import os
import queue
import socket
import threading
import time
import urllib.error
from typing import Any, Dict, Generator, Iterable, List, Optional, Tuple

from dwebapp.ai.credentials_store import get_bytedance_text_cfg
from dwebapp.ai.api.chat.utils import _agent_to_ui_chat_message, _agent_to_ui_error, _agent_to_ui_task_status, _agent_to_ui_text, _openai_chat, _openai_stream_chat

from .sceneLighting_skillMD import build_scene_lighting_system_prompt, build_scene_lighting_user_prompt
from .sceneUnderstand_skill import (
	DEFAULT_SCENE_UNDERSTAND_MODEL,
	ModelResponseParseError,
	RemoteProviderHttpError,
	RemoteProviderNetworkError,
	SCENE_UNDERSTAND_MODEL_OPTIONS,
	SCENE_JSON_CONTINUATION_MAX_ATTEMPTS,
	SCENE_JSON_REWRITE_MAX_ATTEMPTS,
	_extract_cached_tokens,
	_is_unsupported_json_object_error,
	_is_context_cache_fallbackable_http_error,
	_model_option,
	_normalize_scene_understand_inputs,
	_strip_code_fence,
	_extract_first_json_object,
	_compact_preview,
	_resolve_context_model_id,
	_split_scene_understand_messages,
	_ark_context_create,
	_ark_context_chat,
	_ark_context_stream_chat,
)


SCENE_LIGHTING_MODEL_OPTIONS = SCENE_UNDERSTAND_MODEL_OPTIONS
DEFAULT_SCENE_LIGHTING_MODEL = DEFAULT_SCENE_UNDERSTAND_MODEL
ALLOW_SCENE_LIGHTING_MOCK_FALLBACK = str(os.environ.get('SCENE_LIGHTING_ALLOW_MOCK_FALLBACK', '')).strip().lower() in ('1', 'true', 'yes', 'on')


def _normalize_lighting_type(raw_type: Any) -> str:
	text = str(raw_type or '').strip().lower().replace('_', '-').replace(' ', '-')
	if text in ('rectarea', 'rect-area', 'rect-light', 'area', 'area-light'):
		return 'rect-area'
	if text in ('dir', 'direction'):
		return 'directional'
	return text or 'point'


def _lighting_text_blob(item: Dict[str, Any]) -> str:
	parts = [
		str(item.get('name') or ''),
		str(item.get('role') or ''),
		str(item.get('reason') or ''),
		str(item.get('anchorObjectId') or ''),
		str(item.get('fixtureShape') or ''),
		str(item.get('sourceKind') or ''),
		str(item.get('emitMode') or ''),
	]
	return ' '.join(parts).strip().lower()


def _contains_any(text: str, keywords: Tuple[str, ...]) -> bool:
	return any(keyword in text for keyword in keywords)


def _normalize_lighting_type_with_context(item: Dict[str, Any], normalized_type: str) -> str:
	text = _lighting_text_blob(item)
	if _contains_any(text, ('light strip', 'strip light', 'led strip', 'linear light', 'shelf light', 'cabinet light', 'under cabinet', '灯带', '线性', '层板灯', '柜灯', '柜底灯')):
		return 'rect-area'
	if _contains_any(text, ('panel', 'softbox', 'lightbox', 'emissive panel', '面光', '面板灯', '柔光板', '软箱', '发光面')):
		return 'rect-area'
	if _contains_any(text, ('wall sconce', 'wall lamp', 'picture light', 'accent spot', 'downlight', 'track light', 'spotlight', '壁灯', '墙灯', '画灯', '射灯', '轨道灯', '洗墙')):
		return 'spot'
	if _contains_any(text, ('window light', 'sunlight', 'moonlight', 'skylight', 'daylight', '窗光', '天光', '日光', '月光')):
		return 'directional'
	if _contains_any(text, ('screen', 'monitor', 'tv', 'display', 'sign', 'logo', '显示器', '屏幕', '电视', '招牌', '标牌')) and normalized_type == 'point':
		return 'rect-area'
	return normalized_type


def _normalize_light_role(raw_role: Any) -> str:
	return str(raw_role or '').strip().lower().replace('_', '-').replace(' ', '-')


def _professional_intensity_floor(light_type: str, role: str, text: str) -> float:
	base = {
		'ambient': 0.0,
		'hemisphere': 0.02,
		'directional': 0.18,
		'point': 0.08,
		'spot': 0.18,
		'rect-area': 0.04,
	}.get(light_type, 0.5)
	if role in ('key', 'fill'):
		base *= 1.15
	if role in ('accent', 'practical'):
		base *= 1.18
	if _contains_any(text, ('wall sconce', 'wall lamp', 'picture light', 'display light', '壁灯', '墙灯', '画灯', '展示灯')):
		base = max(base, 0.42 if light_type == 'spot' else 0.16)
	if _contains_any(text, ('light strip', 'led strip', 'cabinet light', 'shelf light', '灯带', '层板灯', '柜灯', '柜底灯')):
		base = max(base, 0.06 if light_type == 'rect-area' else base)
	if _contains_any(text, ('screen', 'monitor', 'tv', 'display', '显示器', '屏幕', '电视')):
		base = min(base, 0.04 if light_type == 'rect-area' else base)
	return base


def _professional_distance_floor(light_type: str, text: str) -> Optional[float]:
	if light_type == 'spot':
		if _contains_any(text, ('wall sconce', 'wall lamp', 'picture light', '壁灯', '墙灯', '画灯')):
			return 1.2
		if _contains_any(text, ('display light', 'cabinet light', '展示灯', '柜灯')):
			return 0.9
		return 1.4
	if light_type == 'point':
		return 0.8
	return None


def _professional_rect_area_size(text: str, width: Any, height: Any) -> Tuple[float, float]:
	default_width = float(width or 120)
	default_height = float(height or 40)
	if _contains_any(text, ('light strip', 'led strip', 'linear light', '灯带', '线性', '层板灯', '柜灯', '柜底灯')):
		return min(max(0.3, default_width), 1.2), min(max(0.03, default_height), 0.12)
	if _contains_any(text, ('screen', 'monitor', 'tv', 'display', '显示器', '屏幕', '电视')):
		return min(max(0.24, default_width), 0.72), min(max(0.14, default_height), 0.42)
	return min(max(0.4, default_width), 1.8), min(max(0.12, default_height), 0.9)


def _professional_spot_defaults(text: str, angle: Any, penumbra: Any) -> Tuple[float, float]:
	default_angle = float(angle or 0.58)
	default_penumbra = float(penumbra or 0.35)
	if _contains_any(text, ('wall sconce', 'wall lamp', 'picture light', '壁灯', '墙灯', '画灯')):
		return max(0.18, min(default_angle, 0.52)), max(0.16, min(default_penumbra, 0.38))
	if _contains_any(text, ('display light', 'cabinet light', '展示灯', '柜灯')):
		return max(0.12, min(default_angle, 0.38)), max(0.12, min(default_penumbra, 0.3))
	return max(0.18, min(default_angle, 0.68)), max(0.16, min(default_penumbra, 0.42))


def _normalize_scene_unit_value(value: Any, *, threshold: float, divisor: float = 100.0) -> Any:
	num = float(value or 0)
	if not num:
		return value
	if abs(num) > threshold:
		return num / divisor
	return num


def _normalize_lighting_result(payload: Dict[str, Any]) -> Dict[str, Any]:
	atmosphere = payload.get('atmosphere')
	if not isinstance(atmosphere, dict):
		atmosphere = {}
	payload['atmosphere'] = atmosphere
	global_settings = payload.get('globalSettings')
	if not isinstance(global_settings, dict):
		global_settings = {}
	global_settings['intensityScale'] = min(1.15, max(0.72, float(global_settings.get('intensityScale') or atmosphere.get('intensityScale') or 1.0)))
	global_settings['exposure'] = min(0.95, max(0.55, float(global_settings.get('exposure') or 0.82)))
	global_settings['environmentIntensity'] = min(0.18, max(0.02, float(global_settings.get('environmentIntensity') or 0.08)))
	payload['globalSettings'] = global_settings
	lights = payload.get('lights')
	if not isinstance(lights, list):
		lights = []
	normalized_lights: List[Dict[str, Any]] = []
	for index, item in enumerate(lights):
		if not isinstance(item, dict):
			continue
		raw_position = item.get('position')
		position: Dict[str, Any] = raw_position if isinstance(raw_position, dict) else {}
		raw_rotation = item.get('rotation')
		rotation: Dict[str, Any] = raw_rotation if isinstance(raw_rotation, dict) else {}
		light_type = _normalize_lighting_type_with_context(item, _normalize_lighting_type(item.get('type')))
		role = _normalize_light_role(item.get('role'))
		text = _lighting_text_blob(item)
		intensity = float(item.get('intensity') or 0)
		intensity = max(intensity, _professional_intensity_floor(light_type, role, text))
		distance_floor = _professional_distance_floor(light_type, text)
		distance = _normalize_scene_unit_value(item.get('distance'), threshold=20.0)
		if distance_floor is not None:
			distance = max(float(distance or 0), distance_floor)
		angle = item.get('angle')
		penumbra = item.get('penumbra')
		if light_type == 'spot':
			angle, penumbra = _professional_spot_defaults(text, angle, penumbra)
		width = _normalize_scene_unit_value(item.get('width'), threshold=8.0)
		height = _normalize_scene_unit_value(item.get('height'), threshold=8.0)
		if light_type == 'rect-area':
			width, height = _professional_rect_area_size(text, width, height)
		emit_mode = str(item.get('emitMode') or '').strip() or ('self-emissive-only' if _contains_any(text, ('screen', 'monitor', 'tv', 'display', 'logo', '显示器', '屏幕', '电视', '标牌', '招牌')) else 'illuminates-scene')
		source_kind = str(item.get('sourceKind') or '').strip() or ('emissive-surface' if emit_mode == 'self-emissive-only' else 'practical-fixture')
		fixture_shape = str(item.get('fixtureShape') or '').strip()
		if not fixture_shape:
			if light_type == 'rect-area' and _contains_any(text, ('light strip', 'led strip', '灯带', '层板灯', '柜灯', '柜底灯')):
				fixture_shape = 'strip'
			elif light_type == 'spot' and _contains_any(text, ('wall sconce', 'wall lamp', '壁灯', '墙灯')):
				fixture_shape = 'sconce'
			elif light_type == 'rect-area' and _contains_any(text, ('screen', 'monitor', 'display', '显示器', '屏幕')):
				fixture_shape = 'screen'
			else:
				fixture_shape = 'panel' if light_type == 'rect-area' else 'spot-head' if light_type == 'spot' else 'bulb'
		normalized_lights.append(
			{
				**item,
				'id': str(item.get('id') or f'light-{index + 1}').strip() or f'light-{index + 1}',
				'type': light_type,
				'role': role or item.get('role'),
				'sourceKind': source_kind,
				'emitMode': emit_mode,
				'fixtureShape': fixture_shape,
				'intensity': intensity,
				'distance': distance,
				'angle': angle,
				'penumbra': penumbra,
				'position': {
					'x': float(position.get('x') or 0),
					'y': float(position.get('y') or 0),
					'z': float(position.get('z') or 0),
				},
				'width': float(width or 120) if light_type == 'rect-area' else item.get('width'),
				'height': float(height or 40) if light_type == 'rect-area' else item.get('height'),
				'castShadow': False if emit_mode == 'self-emissive-only' else item.get('castShadow', light_type in ('spot', 'directional')),
				'rotation': (
					{
						'x': float(rotation.get('x') or 0),
						'y': float(rotation.get('y') or 0),
						'z': float(rotation.get('z') or 0),
					}
					if rotation
					else item.get('rotation')
				),
			}
		)
	payload['lights'] = normalized_lights
	if not isinstance(payload.get('sceneSummary'), str):
		payload['sceneSummary'] = f'生成 {len(normalized_lights)} 盏灯光配置。'
	return payload


def _build_mock_result(prompt_text: str, layout_json: str, model: str) -> Dict[str, Any]:
	payload = {
		'sceneSummary': '当前返回为本地 mock 灯光理解结果，可用于 Three.js 灯光预览联调。',
		'lightingStyle': 'focused-task-studio',
		'atmosphere': {
			'preset': 'focused-task-studio',
			'brightness': 'medium',
			'contrast': 'medium-high',
			'warmth': 'neutral-warm',
			'intensityScale': 1.12,
			'notes': '强调工作区与展示墙局部灯具，避免只有环境泛光。',
		},
		'globalSettings': {'exposure': 0.9, 'environmentIntensity': 0.18, 'intensityScale': 1.12, 'notes': 'mock result'},
		'ambientLight': {'color': '#f6eadb', 'intensity': 0.03},
		'hemisphereLight': {'skyColor': '#b8c7dc', 'groundColor': '#2b1f16', 'intensity': 0.08},
		'mainDirectionalLight': {
			'color': '#dbeafe',
			'intensity': 0.78,
			'position': {'x': 260, 'y': 210, 'z': 150},
			'target': {'x': 20, 'y': 70, 'z': 0},
		},
		'lights': [
			{
				'id': 'window-fill-1',
				'name': '窗面柔光',
				'type': 'rect-area',
				'role': 'fill',
				'sourceKind': 'motivated-light',
				'emitMode': 'illuminates-scene',
				'fixtureShape': 'window',
				'color': '#d8e6ff',
				'intensity': 4.6,
				'width': 140,
				'height': 180,
				'castShadow': True,
				'position': {'x': 180, 'y': 150, 'z': 120},
				'target': {'x': 20, 'y': 78, 'z': 0},
				'reason': '模拟窗面与柔光板带来的大面积冷色补光。',
			},
			{
				'id': 'desk-key-1',
				'name': '桌面主光',
				'type': 'spot',
				'role': 'key',
				'sourceKind': 'practical-fixture',
				'emitMode': 'illuminates-scene',
				'fixtureShape': 'spot-head',
				'color': '#ffd7a8',
				'intensity': 2.8,
				'distance': 320,
				'decay': 1.0,
				'angle': 0.58,
				'penumbra': 0.48,
				'castShadow': True,
				'position': {'x': 10, 'y': 210, 'z': 10},
				'target': {'x': 0, 'y': 72, 'z': 5},
				'reason': '模拟室内工作区上方的暖色主光。',
			},
			{
				'id': 'wall-sconce-1',
				'name': '墙面壁灯',
				'type': 'spot',
				'role': 'practical',
				'sourceKind': 'practical-fixture',
				'emitMode': 'mixed',
				'fixtureShape': 'sconce',
				'color': '#ffd9b5',
				'intensity': 2.2,
				'distance': 190,
				'decay': 1.0,
				'angle': 0.46,
				'penumbra': 0.36,
				'castShadow': False,
				'position': {'x': 86, 'y': 156, 'z': -118},
				'target': {'x': 62, 'y': 132, 'z': -72},
				'reason': '壁灯不应只表现为亮贴片，需要对墙面和展示区域形成明确局部洗光。',
			},
			{
				'id': 'shelf-strip-1',
				'name': '书架层板灯带',
				'type': 'rect-area',
				'role': 'accent',
				'sourceKind': 'practical-fixture',
				'emitMode': 'mixed',
				'fixtureShape': 'strip',
				'color': '#ffbe82',
				'intensity': 5.2,
				'width': 96,
				'height': 10,
				'castShadow': False,
				'position': {'x': -150, 'y': 130, 'z': -80},
				'target': {'x': -126, 'y': 118, 'z': -42},
				'reason': '线性层板灯带应使用窄长 rect-area，并确保柜体受光明确可见。',
			},
		],
		'promptEcho': prompt_text,
		'layoutEcho': layout_json[:300],
	}
	payload = _normalize_lighting_result(payload)
	output = json.dumps(payload, ensure_ascii=False, indent=2)
	return {'ok': True, 'model': model, 'outputJson': output, 'summary': payload['sceneSummary'], 'mock': True}


def _build_scene_lighting_messages(prompt_text: str, layout_json: str, image_inputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	content_items: List[Dict[str, Any]] = [
		{
			'type': 'text',
			'text': '以下图片是同一室内空间的灯光参考图。请结合后续给出的布局 JSON 输出可直接用于 Three.js 预览的灯光配置 JSON。',
		}
	]
	for item in image_inputs[:4]:
		content_items.append({'type': 'image_url', 'image_url': {'url': str(item.get('imageRef') or ''), 'detail': 'high'}})
	messages: List[Dict[str, Any]] = [
		{'role': 'system', 'content': build_scene_lighting_system_prompt()},
		{
			'role': 'user',
			'content': [
				*content_items,
				{'type': 'text', 'text': build_scene_lighting_user_prompt(prompt_text, layout_json, image_count=len(image_inputs))},
			],
		},
	]
	return messages


def _lighting_continuation_instruction(raw_text: str, *, attempt: int) -> str:
	tail_preview = _compact_preview(str(raw_text or '')[-800:], limit=800)
	return (
		f'你上一条 assistant 消息输出的灯光 JSON 在中途结束了。当前为第 {attempt} 次续写。'
		'请基于当前会话中已经完成的同一次灯光分析，从你上一条 assistant 消息的最后一个字符继续补全剩余 JSON。'
		'不要重头再写，不要重复任何已经输出过的前缀，不要输出 markdown，不要输出解释。'
		'以下只是已输出尾部预览，帮助你对齐，严禁重复原样输出这段预览：\n\n'
		f'{tail_preview}'
	)


def _lighting_rewrite_instruction(raw_text: str, *, reason: str, attempt: int) -> str:
	broken = str(raw_text or '').strip()
	reason_text = '上一轮输出过长，存在被截断风险。' if reason == 'too_long' else '上一轮输出 JSON 不完整或不可解析。'
	return (
		f'{reason_text}'
		'请基于你刚才同一轮灯光分析结果继续完成，不要重新解释，不要输出 markdown。'
		'请直接输出一个完整、严格合法、单个 JSON 对象。'
		'不要丢失 sceneSummary、lightingStyle、globalSettings、ambientLight、hemisphereLight、mainDirectionalLight 与 lights 字段。'
		'请优先做补全和闭合，必要时压缩 reason、notes 等文案字段。'
		f'当前为第 {attempt} 次紧凑重写。以下是上一轮原始输出：\n\n{broken}'
	)


def _lighting_context_rewrite_instruction(raw_text: str, *, reason: str, attempt: int) -> str:
	reason_text = '上一轮输出过长，存在截断风险。' if reason == 'too_long' else '上一轮输出 JSON 不完整或不可解析。'
	tail_preview = _compact_preview(str(raw_text or '')[-800:], limit=800)
	return (
		f'{reason_text}'
		f'当前为第 {attempt} 次紧凑重写。'
		'请基于当前会话中已经完成的同一次灯光分析与刚才那条未完成回复，重新输出一个完整、严格合法、单个 JSON 对象。'
		'不要丢失 sceneSummary、lightingStyle、globalSettings、ambientLight、hemisphereLight、mainDirectionalLight 与 lights 字段。'
		'请压缩 reason、notes 等长文本，不要输出 markdown 或解释。'
		'以下是上一轮回复的尾部预览，仅用于帮助你识别当前上下文，不要求原样复述：\n\n'
		f'{tail_preview}'
	)


def _lighting_json_needs_rewrite(text: str, parse_error: Optional[Exception] = None) -> bool:
	raw = str(text or '').strip()
	if not raw:
		return False
	if parse_error is not None:
		return True
	return len(raw) >= 10000


def _lighting_json_should_continue(text: str, parse_error: Optional[Exception] = None) -> bool:
	raw = _strip_code_fence(str(text or '')).strip()
	if not raw:
		return False
	if raw.count('{') > raw.count('}'):
		return True
	if parse_error is None:
		return False
	detail = str(getattr(parse_error, 'detail', parse_error) or '')
	if any(marker in detail for marker in ('截断', '未闭合', '未找到 JSON 对象')):
		return True
	return len(raw) >= 10000


def _lighting_continuation_prefill(raw_text: str) -> str:
	text = _strip_code_fence(str(raw_text or ''))
	start = text.find('{')
	if start >= 0:
		return text[start:]
	return text


def _merge_lighting_json_progress(existing_text: str, new_text: str) -> str:
	base = str(existing_text or '')
	incoming = _strip_code_fence(str(new_text or ''))
	if not incoming:
		return base
	max_overlap = min(len(base), len(incoming), 512)
	for size in range(max_overlap, 0, -1):
		if base.endswith(incoming[:size]):
			return base + incoming[size:]
	return base + incoming


def _continue_lighting_json_via_prefill(
	*,
	model: str,
	api_key: str,
	base_url: str,
	messages: List[Dict[str, Any]],
	raw_text: str,
	context_id: Optional[str] = None,
	attempt: int = 1,
) -> Optional[str]:
	if context_id:
		try:
			return _ark_context_chat(
				base_url=base_url.rstrip('/'),
				api_key=api_key,
				context_id=context_id,
				model=model,
				messages=[{'role': 'user', 'content': _lighting_continuation_instruction(raw_text, attempt=attempt)}],
				response_format=None,
				timeout_s=None,
			)
		except Exception:
			return None
	prefill = _lighting_continuation_prefill(raw_text)
	if not prefill.strip():
		return None
	try:
		return _openai_chat(
			base_url=base_url.rstrip('/'),
			api_key=api_key,
			model=model,
			messages=[*messages, {'role': 'assistant', 'content': prefill}],
			response_format=None,
			timeout_s=None,
		)
	except Exception:
		return None


def _stream_lighting_json_continuation(
	*,
	model: str,
	api_key: str,
	base_url: str,
	messages: List[Dict[str, Any]],
	base_content: str,
	on_delta,
	context_id: Optional[str] = None,
	attempt: int = 1,
) -> Optional[str]:
	if context_id:
		continuation_accum = ''
		merged = str(base_content or '')
		try:
			for delta in _ark_context_stream_chat(
				base_url=base_url.rstrip('/'),
				api_key=api_key,
				context_id=context_id,
				model=model,
				messages=[{'role': 'user', 'content': _lighting_continuation_instruction(base_content, attempt=attempt)}],
				response_format=None,
				timeout_s=None,
			):
				if not delta:
					continue
				continuation_accum += delta
				next_merged = _merge_lighting_json_progress(base_content, continuation_accum)
				if len(next_merged) > len(merged):
					on_delta(next_merged[len(merged):])
				merged = next_merged
		except Exception:
			return None
		return merged if str(merged or '').strip() else None
	prefill = _lighting_continuation_prefill(base_content)
	if not prefill.strip():
		return None
	continuation_accum = ''
	merged = str(base_content or '')
	for delta in _openai_stream_chat(
		base_url=base_url.rstrip('/'),
		api_key=api_key,
		model=model,
		messages=[*messages, {'role': 'assistant', 'content': prefill}],
		response_format=None,
		timeout_s=None,
	):
		if not delta:
			continue
		continuation_accum += delta
		next_merged = _merge_lighting_json_progress(base_content, continuation_accum)
		if len(next_merged) > len(merged):
			on_delta(next_merged[len(merged):])
		merged = next_merged
	return merged if str(merged or '').strip() else None


def _stream_lighting_json_rewrite(
	*,
	model: str,
	api_key: str,
	base_url: str,
	messages: List[Dict[str, Any]],
	raw_text: str,
	reason: str,
	attempt: int,
	context_id: Optional[str] = None,
	response_format: Optional[Dict[str, Any]] = None,
	on_usage=None,
	timeout_s: Optional[float] = 60,
) -> Iterable[str]:
	if context_id:
		return _ark_context_stream_chat(
			base_url=base_url,
			api_key=api_key,
			context_id=context_id,
			model=model,
			messages=[{'role': 'user', 'content': _lighting_context_rewrite_instruction(raw_text, reason=reason, attempt=attempt)}],
			response_format=None,
			on_usage=on_usage,
			timeout_s=timeout_s,
		)
	return _openai_stream_chat(
		base_url=base_url,
		api_key=api_key,
		model=model,
		messages=[
			*messages,
			{'role': 'assistant', 'content': str(raw_text or '')},
			{'role': 'user', 'content': _lighting_rewrite_instruction(raw_text, reason=reason, attempt=attempt)},
		],
		response_format=response_format,
		timeout_s=timeout_s,
	)


def _rewrite_lighting_json_via_same_context(
	*,
	model: str,
	api_key: str,
	base_url: str,
	messages: List[Dict[str, Any]],
	raw_text: str,
	reason: str,
	attempt: int,
	context_id: Optional[str] = None,
) -> Optional[str]:
	if context_id:
		for response_format in ({'type': 'json_object'}, None):
			try:
				return _ark_context_chat(
					base_url=base_url.rstrip('/'),
					api_key=api_key,
					context_id=context_id,
					model=model,
					messages=[{'role': 'user', 'content': _lighting_context_rewrite_instruction(raw_text, reason=reason, attempt=attempt)}],
					response_format=response_format,
					timeout_s=None,
				)
			except urllib.error.HTTPError as exc:
				detail = exc.read().decode('utf-8', errors='ignore')
				if response_format is not None and _is_unsupported_json_object_error(detail):
					continue
				return None
			except Exception:
				if response_format is not None:
					continue
				return None
		return None
	for response_format in ({'type': 'json_object'}, None):
		try:
			return _openai_chat(
				base_url=base_url.rstrip('/'),
				api_key=api_key,
				model=model,
				messages=[
					*messages,
					{'role': 'assistant', 'content': str(raw_text or '')},
					{'role': 'user', 'content': _lighting_rewrite_instruction(raw_text, reason=reason, attempt=attempt)},
				],
				response_format=response_format,
				timeout_s=None,
			)
		except urllib.error.HTTPError as exc:
			detail = exc.read().decode('utf-8', errors='ignore')
			if response_format is not None and _is_unsupported_json_object_error(detail):
				continue
			return None
		except Exception:
			if response_format is not None:
				continue
			return None
	return None


def _parse_scene_lighting_content(*, content: str, model: str, api_key: str, base_url: str) -> Dict[str, Any]:
	try:
		parsed = _extract_first_json_object(str(content or ''))
	except ModelResponseParseError as exc:
		from .sceneUnderstand_skill import _repair_scene_json_via_model
		repaired = _repair_scene_json_via_model(
			model=model,
			api_key=api_key,
			base_url=base_url,
			raw_text=str(content or ''),
		)
		if repaired and str(repaired).strip() and str(repaired).strip() != str(content or '').strip():
			parsed = _extract_first_json_object(repaired)
		else:
			raise exc
	return _normalize_lighting_result(parsed)


def _finalize_scene_lighting_candidate(
	*,
	model: str,
	api_key: str,
	base_url: str,
	messages: List[Dict[str, Any]],
	candidate_content: str,
	context_id: Optional[str] = None,
) -> Tuple[Dict[str, Any], str, bool, int]:
	current_content = str(candidate_content or '')
	continuation_attempts = 0
	parse_error: Optional[Exception] = None
	for continuation_attempt in range(1, SCENE_JSON_CONTINUATION_MAX_ATTEMPTS + 1):
		try:
			parsed = _parse_scene_lighting_content(
				content=current_content,
				model=model,
				api_key=api_key,
				base_url=base_url,
			)
			return parsed, current_content, continuation_attempts > 0, continuation_attempts
		except ModelResponseParseError as exc:
			parse_error = exc
			if continuation_attempt >= SCENE_JSON_CONTINUATION_MAX_ATTEMPTS:
				break
			if not _lighting_json_should_continue(current_content, exc):
				break
			continued = _continue_lighting_json_via_prefill(
				model=model,
				api_key=api_key,
				base_url=base_url,
				messages=messages,
				raw_text=current_content,
				context_id=context_id,
				attempt=continuation_attempt,
			)
			if not str(continued or '').strip():
				break
			current_content = _merge_lighting_json_progress(current_content, str(continued or ''))
			continuation_attempts = continuation_attempt
	if _lighting_json_needs_rewrite(current_content, parse_error):
		for rewrite_attempt in range(1, SCENE_JSON_REWRITE_MAX_ATTEMPTS + 1):
			rewritten = _rewrite_lighting_json_via_same_context(
				model=model,
				api_key=api_key,
				base_url=base_url,
				messages=messages,
				raw_text=current_content,
				reason='too_long' if len(str(current_content or '')) >= 10000 else 'parse_error',
				attempt=rewrite_attempt,
				context_id=context_id,
			)
			if not str(rewritten or '').strip():
				continue
			current_content = str(rewritten or '')
			parsed = _parse_scene_lighting_content(
				content=current_content,
				model=model,
				api_key=api_key,
				base_url=base_url,
			)
			return parsed, current_content, True, continuation_attempts
	if parse_error is not None:
		raise parse_error
	raise ModelResponseParseError('模型未返回可解析 JSON')


def _call_ark_scene_lighting(model: str, prompt_text: str, layout_json: str, image_inputs: List[Dict[str, Any]]) -> Dict[str, Any]:
	config = get_bytedance_text_cfg()
	api_key = str(config.get('api_key') or '').strip()
	base_url = str(config.get('base_url') or '').strip()
	if not api_key:
		raise RuntimeError('missing scene lighting api key')
	if not base_url:
		raise RuntimeError('missing scene lighting service base url')
	if not image_inputs:
		raise RuntimeError('image reference is required')
	messages = _build_scene_lighting_messages(prompt_text, layout_json, image_inputs)
	context_seed_messages, first_turn_messages = _split_scene_understand_messages(messages)
	model_meta = _model_option(model) or {}
	supports_structured = bool(model_meta.get('supportsStructuredOutput'))
	context_model = _resolve_context_model_id(model)
	last_error: Optional[Exception] = None
	content = ''
	for response_format in ([{'type': 'json_object'}] if supports_structured else []) + [None]:
		try:
			context_id: Optional[str] = None
			use_context = bool(context_model)
			usage_box: Dict[str, Any] = {}
			try:
				if use_context:
					context_id = _ark_context_create(
						base_url=base_url.rstrip('/'),
						api_key=api_key,
						model=context_model,
						seed_messages=context_seed_messages,
					)
			except urllib.error.HTTPError as exc:
				detail = exc.read().decode('utf-8', errors='ignore')
				if _is_context_cache_fallbackable_http_error(exc.code, detail):
					use_context = False
				else:
					raise
			if use_context and context_id:
				content = _ark_context_chat(
					base_url=base_url.rstrip('/'),
					api_key=api_key,
					context_id=context_id,
					model=context_model,
					messages=first_turn_messages,
					response_format=None,
					on_usage=lambda usage: usage_box.update({'usage': usage}),
					timeout_s=None,
				)
			else:
				content = _openai_chat(
					base_url=base_url.rstrip('/'),
					api_key=api_key,
					model=model,
					messages=messages,
					response_format=response_format,
					timeout_s=None,
				)
			if not str(content or '').strip():
				continue
			parsed, candidate_content, rewrite_used, rewrite_attempts = _finalize_scene_lighting_candidate(
				model=model,
				api_key=api_key,
				base_url=base_url,
				messages=messages,
				candidate_content=str(content or ''),
				context_id=context_id,
			)
			output = json.dumps(parsed, ensure_ascii=False, indent=2)
			return {
				'ok': True,
				'model': model,
				'outputJson': output,
				'rawOutput': candidate_content,
				'rewriteUsed': rewrite_used,
				'rewriteAttempts': rewrite_attempts,
				'summary': str(parsed.get('sceneSummary') or f'生成 {len(parsed.get("lights") or [])} 盏灯光配置。'),
				'provider': 'volcengine-ark',
				'providerStatusText': (
					(
						f'已命中 Context Cache（cached_tokens={_extract_cached_tokens(usage_box.get("usage")) or 0}）'
						if use_context and context_id
						else ('普通请求模式（未配置 Context Endpoint ID）' if not context_model else '已收到远端服务响应')
					)
					+ ('（已触发续写/重试）' if rewrite_used else '')
				),
				'remoteStatusCode': 200,
				'mock': False,
			}
		except urllib.error.HTTPError as exc:
			detail = exc.read().decode('utf-8', errors='ignore')
			last_error = RemoteProviderHttpError(exc.code, detail or f'ark http error {exc.code}')
			continue
		except ModelResponseParseError as exc:
			last_error = exc
			continue
		except socket.timeout as exc:
			last_error = RemoteProviderNetworkError(f'ark network timeout: {exc}')
			continue
		except Exception as exc:
			last_error = RemoteProviderNetworkError(str(exc or 'unknown network error'))
			continue
	if not str(content or '').strip():
		if last_error is not None:
			raise RuntimeError(f'ark request failed: {last_error}') from last_error
		raise RuntimeError('ark response content is empty')
	if isinstance(last_error, ModelResponseParseError):
		raise RuntimeError(f'ark returned malformed lighting JSON: {last_error.detail}') from last_error
	if last_error is not None:
		raise RuntimeError(f'ark request failed: {last_error}') from last_error
	raise RuntimeError('ark response content is empty')


def _call_scene_lighting(model: str, prompt_text: str, layout_json: str, image_inputs: List[Dict[str, Any]]) -> Dict[str, Any]:
	config = get_bytedance_text_cfg()
	api_key = str(config.get('api_key') or '').strip()
	base_url = str(config.get('base_url') or '').strip()
	if not api_key:
		raise RuntimeError('missing scene lighting api key')
	if not base_url:
		raise RuntimeError('missing scene lighting service base url')
	messages = _build_scene_lighting_messages(prompt_text, layout_json, image_inputs)
	model_meta = _model_option(model) or {}
	supports_structured = bool(model_meta.get('supportsStructuredOutput'))
	attempt_response_formats: List[Optional[Dict[str, Any]]] = []
	if supports_structured:
		attempt_response_formats.append({'type': 'json_object'})
	attempt_response_formats.append(None)
	last_error: Optional[Exception] = None
	for response_format in attempt_response_formats:
		try:
			content = _openai_chat(
				base_url=base_url.rstrip('/'),
				api_key=api_key,
				model=model,
				messages=messages,
				response_format=response_format,
				timeout_s=None,
			)
			parsed = _normalize_lighting_result(_extract_first_json_object(content))
			output = json.dumps(parsed, ensure_ascii=False, indent=2)
			return {
				'ok': True,
				'model': model,
				'outputJson': output,
				'summary': str(parsed.get('sceneSummary') or f'生成 {len(parsed.get("lights") or [])} 盏灯光配置。'),
				'provider': 'volcengine-ark',
				'providerStatusText': '远端服务已返回灯光结果。',
			}
		except urllib.error.HTTPError as exc:
			detail = exc.read().decode('utf-8', errors='ignore')
			if response_format is not None and _is_unsupported_json_object_error(detail):
				last_error = exc
				continue
			raise RuntimeError(f'远端服务返回错误：{detail or exc}') from exc
		except Exception as exc:
			last_error = exc
			continue
	if last_error is not None:
		raise last_error
	raise RuntimeError('scene lighting returned empty content')


def run_scene_lighting(*, node_id: str, model: str, prompt_text: str, layout_json: str, image_url: str, image_data_url: str, image_inputs: Any = None) -> Dict[str, Any]:
	resolved_model = model or DEFAULT_SCENE_LIGHTING_MODEL
	try:
		normalized_inputs = _normalize_scene_understand_inputs(image_inputs, image_url, image_data_url)
	except Exception as exc:
		return {'ok': False, 'error': str(exc or 'invalid image input')}
	if not normalized_inputs:
		return {'ok': False, 'error': 'imageUrl or imageDataUrl is required'}
	if not str(layout_json or '').strip():
		return {'ok': False, 'error': 'layoutJson is required'}
	try:
		return _call_ark_scene_lighting(resolved_model, prompt_text, layout_json, normalized_inputs)
	except RemoteProviderHttpError as exc:
		return {
			'ok': False,
			'error': f'远端服务返回错误：{exc.detail}',
			'model': resolved_model,
			'status': exc.status_code,
			'provider': exc.provider,
			'providerStatusText': f'远端服务 HTTP {exc.status_code}',
			'remoteStatusCode': exc.status_code,
		}
	except RemoteProviderNetworkError as exc:
		return {
			'ok': False,
			'error': f'远端服务网络请求失败：{exc.detail}',
			'model': resolved_model,
			'status': 502,
			'provider': exc.provider,
			'providerStatusText': '等待远端服务响应时发生网络异常',
		}
	except ModelResponseParseError as exc:
		return {
			'ok': False,
			'error': f'远端服务返回的灯光 JSON 无法解析：{exc.detail}',
			'model': resolved_model,
			'status': 502,
			'provider': exc.provider,
			'providerStatusText': '远端服务返回了不可解析的结构化结果',
		}
	except Exception as exc:
		if not ALLOW_SCENE_LIGHTING_MOCK_FALLBACK:
			error_text = str(exc or 'unknown error')
			if 'malformed lighting JSON' in error_text:
				return {
					'ok': False,
					'error': f'远端服务返回的灯光 JSON 无法解析：{error_text.split("malformed lighting JSON:", 1)[-1].strip()}',
					'model': resolved_model,
					'status': 502,
					'provider': 'volcengine-ark',
					'providerStatusText': '远端服务返回了不可解析的结构化结果',
				}
			return {
				'ok': False,
				'error': f'场景灯光理解真实接口调用失败：{error_text}',
				'model': resolved_model,
				'status': 500,
				'provider': 'volcengine-ark',
				'providerStatusText': '服务端场景灯光理解封装失败',
			}
		return _build_mock_result(prompt_text, layout_json, resolved_model)


def stream_scene_lighting(*, node_id: str, model: str, prompt_text: str, layout_json: str, image_url: str, image_data_url: str, image_inputs: Any = None) -> Generator[Dict[str, Any], None, None]:
	resolved_model = model or DEFAULT_SCENE_LIGHTING_MODEL
	try:
		normalized_inputs = _normalize_scene_understand_inputs(image_inputs, image_url, image_data_url)
	except Exception as exc:
		yield _agent_to_ui_error('bad_input', str(exc or 'invalid image input'))
		return
	if not normalized_inputs:
		yield _agent_to_ui_error('bad_request', 'imageUrl or imageDataUrl is required')
		return
	if not str(layout_json or '').strip():
		yield _agent_to_ui_error('bad_request', 'layoutJson is required')
		return
	config = get_bytedance_text_cfg()
	api_key = str(config.get('api_key') or '').strip()
	base_url = str(config.get('base_url') or '').strip()
	if not api_key:
		yield _agent_to_ui_error('missing_config', 'missing scene lighting api key', details={'provider': 'volcengine-ark'})
		return
	if not base_url:
		yield _agent_to_ui_error('missing_config', 'missing scene lighting service base url', details={'provider': 'volcengine-ark'})
		return
	messages = _build_scene_lighting_messages(prompt_text, layout_json, normalized_inputs)
	model_meta = _model_option(resolved_model) or {}
	supports_structured = bool(model_meta.get('supportsStructuredOutput'))
	context_model = _resolve_context_model_id(resolved_model)
	messages = _build_scene_lighting_messages(prompt_text, layout_json, normalized_inputs)
	context_seed_messages, first_turn_messages = _split_scene_understand_messages(messages)
	yield _agent_to_ui_task_status('started', message='场景灯光理解已开始')
	yield _agent_to_ui_task_status('prepare_input', message='已接收参考图与布局 JSON，准备提交灯光理解请求')
	yield _agent_to_ui_task_status('connect', message='正在连接多模态模型服务')
	yield _agent_to_ui_task_status('submit', message=f'已提交场景灯光理解请求到 {resolved_model}')
	out_q: 'queue.Queue[tuple[str, Dict[str, Any] | None]]' = queue.Queue()

	def _emit_msg(payload: Dict[str, Any]) -> None:
		out_q.put(('msg', payload))

	def _emit_done() -> None:
		out_q.put(('done', None))

	def _worker() -> None:
		last_error: Optional[Exception] = None
		try:
			attempt_response_formats: List[Optional[Dict[str, Any]]] = []
			if supports_structured:
				attempt_response_formats.append({'type': 'json_object'})
			attempt_response_formats.append(None)
			for response_format in attempt_response_formats:
				try:
					context_id: Optional[str] = None
					use_context = bool(context_model)
					cache_usage_box: Dict[str, Any] = {}
					if not use_context:
						_emit_msg(_agent_to_ui_task_status('submit', message='未配置 Context Endpoint ID，当前任务将使用普通请求模式'))
					try:
						if use_context:
							context_id = _ark_context_create(
								base_url=base_url.rstrip('/'),
								api_key=api_key,
								model=context_model,
								seed_messages=context_seed_messages,
							)
							_emit_msg(_agent_to_ui_task_status('submit', message=f'已创建上下文缓存并提交灯光理解请求到 {context_model}'))
					except urllib.error.HTTPError as exc:
						detail = exc.read().decode('utf-8', errors='ignore')
						if _is_context_cache_fallbackable_http_error(exc.code, detail):
							use_context = False
							_emit_msg(_agent_to_ui_task_status('submit', message='当前服务端点不支持 Context API，已自动回退普通请求模式'))
						else:
							raise
					buf = ''
					first_delta = True
					chunk_count = 0
					stream = (
						_ark_context_stream_chat(
							base_url=base_url.rstrip('/'),
							api_key=api_key,
							context_id=context_id,
							model=context_model,
							messages=first_turn_messages,
							response_format=None,
							on_usage=lambda usage: cache_usage_box.update({'usage': usage}),
							timeout_s=None,
						)
						if use_context and context_id
						else _openai_stream_chat(
							base_url=base_url.rstrip('/'),
							api_key=api_key,
							model=resolved_model,
							messages=messages,
							response_format=response_format,
							timeout_s=None,
						)
					)
					for delta in stream:
						if not delta:
							continue
						buf += delta
						_emit_msg(_agent_to_ui_text(delta, source_model=resolved_model, source_name='volcengine-ark'))
						chunk_count += 1
						if first_delta:
							first_delta = False
							_emit_msg(_agent_to_ui_task_status('streaming', message='远端服务已开始流式返回灯光 JSON'))
						if chunk_count % 8 == 1:
							_emit_msg(_agent_to_ui_task_status('writing', message=f'已接收远端返回片段，累计 {len(buf)} chars'))
					if not str(buf or '').strip():
						continue
					candidate_content = str(buf or '')
					rewrite_used = False
					rewrite_attempts = 0
					parse_error: Optional[Exception] = None
					for continuation_attempt in range(1, SCENE_JSON_CONTINUATION_MAX_ATTEMPTS + 1):
						_emit_msg(_agent_to_ui_task_status('parse', message='正在解析远端返回的灯光 JSON'))
						try:
							parsed = _parse_scene_lighting_content(
								content=candidate_content,
								model=resolved_model,
								api_key=api_key,
								base_url=base_url,
							)
							break
						except ModelResponseParseError as exc:
							parse_error = exc
							if continuation_attempt >= SCENE_JSON_CONTINUATION_MAX_ATTEMPTS or not _lighting_json_should_continue(candidate_content, exc):
								parsed = None
								break
							_emit_msg(_agent_to_ui_task_status('rewrite', message=f'检测到输出可能被截断，正在按续写模式继续补全（第 {continuation_attempt} 次）', details={'continuationAttempt': continuation_attempt, 'rewriteReason': 'continuation'}))
							continued = _stream_lighting_json_continuation(
								model=resolved_model,
								api_key=api_key,
								base_url=base_url,
								messages=messages,
								base_content=candidate_content,
								context_id=context_id,
								attempt=continuation_attempt,
								on_delta=lambda text: _emit_msg(_agent_to_ui_text(text, source_model=resolved_model, source_name='volcengine-ark')),
							)
							if not str(continued or '').strip():
								parsed = None
								break
							candidate_content = str(continued or '')
							rewrite_used = True
							rewrite_attempts = continuation_attempt
					if parsed is None and _lighting_json_needs_rewrite(candidate_content, parse_error):
						for rewrite_attempt in range(1, SCENE_JSON_REWRITE_MAX_ATTEMPTS + 1):
							_emit_msg(_agent_to_ui_task_status('writing', message=f'续写仍未闭合，正在发起第 {rewrite_attempt} 次紧凑重写兜底', details={'resetDraft': True, 'rewriteAttempt': rewrite_attempt, 'rewriteReason': 'fallback-rewrite'}))
							rewrite_buf = ''
							stream_failed = False
							for rewrite_response_format in ({'type': 'json_object'}, None):
								rewrite_buf = ''
								try:
									for rewrite_delta in _stream_lighting_json_rewrite(
										model=resolved_model,
										api_key=api_key,
										base_url=base_url.rstrip('/'),
										messages=messages,
										raw_text=candidate_content,
										reason='too_long',
										attempt=rewrite_attempt,
										context_id=context_id,
										response_format=rewrite_response_format,
										on_usage=lambda usage: cache_usage_box.update({'usage': usage}),
										timeout_s=None,
									):
										if not rewrite_delta:
											continue
										rewrite_buf += rewrite_delta
										_emit_msg(_agent_to_ui_text(rewrite_delta, source_model=resolved_model, source_name='volcengine-ark'))
									break
								except urllib.error.HTTPError as exc:
									detail = exc.read().decode('utf-8', errors='ignore')
									if rewrite_response_format is not None and _is_unsupported_json_object_error(detail):
										_emit_msg(_agent_to_ui_task_status('rewrite', message='当前模型不支持 json_object，已自动切换到普通重写模式'))
										continue
									last_error = RemoteProviderHttpError(exc.code, detail or f'ark http error {exc.code}')
									stream_failed = True
									break
								except Exception as exc:
									last_error = RemoteProviderNetworkError(str(exc or 'unknown network error'))
									stream_failed = True
									break
								if str(rewrite_buf or '').strip():
									break
							if stream_failed:
								break
							if not str(rewrite_buf or '').strip():
								continue
							candidate_content = rewrite_buf
							rewrite_used = True
							rewrite_attempts = max(rewrite_attempts, rewrite_attempt)
							_emit_msg(_agent_to_ui_task_status('parse', message='正在解析紧凑重写后的灯光 JSON'))
							parsed = _parse_scene_lighting_content(
								content=candidate_content,
								model=resolved_model,
								api_key=api_key,
								base_url=base_url,
							)
							break
					if parsed is None:
						if parse_error is not None:
							raise parse_error
						raise ModelResponseParseError('模型未返回可解析 JSON')
					result_payload = {
						'ok': True,
						'model': resolved_model,
						'outputJson': json.dumps(parsed, ensure_ascii=False, indent=2),
						'rawOutput': candidate_content,
						'rewriteUsed': rewrite_used,
						'rewriteAttempts': rewrite_attempts,
						'summary': str(parsed.get('sceneSummary') or f'生成 {len(parsed.get("lights") or [])} 盏灯光配置。'),
						'provider': 'volcengine-ark',
						'providerStatusText': (
							(
								f'已命中 Context Cache（cached_tokens={_extract_cached_tokens(cache_usage_box.get("usage")) or 0}）'
								if use_context and context_id
								else '已收到远端流式结果'
							)
							+ ('（已触发紧凑重写）' if rewrite_used else '')
						),
						'remoteStatusCode': 200,
						'mock': False,
						'nodeId': node_id,
					}
					_emit_msg(_agent_to_ui_chat_message(json.dumps(result_payload, ensure_ascii=False), source_model=resolved_model, source_name='volcengine-ark'))
					_emit_msg(_agent_to_ui_task_status('done', message='场景灯光理解完成'))
					_emit_done()
					return
				except urllib.error.HTTPError as exc:
					detail = exc.read().decode('utf-8', errors='ignore')
					last_error = RemoteProviderHttpError(exc.code, detail or f'ark http error {exc.code}')
					continue
				except ModelResponseParseError as exc:
					last_error = exc
					continue
				except socket.timeout as exc:
					last_error = RemoteProviderNetworkError(f'ark network timeout: {exc}')
					continue
				except Exception as exc:
					last_error = RemoteProviderNetworkError(str(exc or 'unknown network error'))
					continue
			if isinstance(last_error, RemoteProviderHttpError):
				_emit_msg(_agent_to_ui_error('upstream_http_error', f'远端服务返回错误：{last_error.detail}', details={'provider': last_error.provider, 'status': last_error.status_code, 'remoteStatusCode': last_error.status_code, 'providerStatusText': f'远端服务 HTTP {last_error.status_code}'}))
			elif isinstance(last_error, RemoteProviderNetworkError):
				_emit_msg(_agent_to_ui_error('upstream_network_error', f'远端服务网络请求失败：{last_error.detail}', details={'provider': last_error.provider, 'status': 502, 'providerStatusText': '等待远端服务响应时发生网络异常'}))
			elif isinstance(last_error, ModelResponseParseError):
				_emit_msg(_agent_to_ui_error('invalid_model_json', f'远端服务返回的灯光 JSON 无法解析：{last_error.detail}', details={'provider': last_error.provider, 'status': 502, 'providerStatusText': '远端服务返回了不可解析的结构化结果', 'rawPreview': last_error.raw_preview}))
			elif last_error is not None:
				_emit_msg(_agent_to_ui_error('scene_lighting_error', f'场景灯光理解真实接口调用失败：{str(last_error or "unknown error")}', details={'provider': 'volcengine-ark', 'status': 500, 'providerStatusText': '服务端场景灯光理解封装失败'}))
			else:
				_emit_msg(_agent_to_ui_error('empty_response', 'ark response content is empty', details={'provider': 'volcengine-ark'}))
		except Exception as exc:
			_emit_msg(_agent_to_ui_error('scene_lighting_stream_error', str(exc or 'unknown error'), details={'provider': 'volcengine-ark'}))
		finally:
			_emit_done()

	thread = threading.Thread(target=_worker, daemon=True)
	thread.start()

	finished = {'done': False}
	while True:
		try:
			kind, payload = out_q.get(timeout=1.0)
		except queue.Empty:
			if finished['done']:
				break
			yield _agent_to_ui_task_status('heartbeat', message='远端仍在处理中，保持 SSE 连接中…')
			continue
		if kind == 'done':
			finished['done'] = True
			break
		if payload is not None:
			yield payload