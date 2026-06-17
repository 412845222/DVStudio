from __future__ import annotations

import base64
import json
import math
import mimetypes
import os
import queue
import re
import socket
import threading
import time
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Generator, Iterable, List, Optional, Tuple

from django.conf import settings

from dwebapp.ai.credentials_store import get_bytedance_text_cfg
from dwebapp.ai.api.chat.utils import _agent_to_ui_chat_message, _agent_to_ui_error, _agent_to_ui_task_status, _agent_to_ui_text, _openai_chat, _openai_stream_chat

from .sceneUnderstand_skillMD import (
	build_scene_understand_system_prompt,
	build_scene_understand_user_prompt,
)


SCENE_UNDERSTAND_MODEL_OPTIONS: List[Dict[str, Any]] = [
	{
		'id': 'doubao-seed-2-0-pro-260215',
		'label': '豆包 Seed 2.0 Pro',
		'supportsVision': True,
		'supportsStructuredOutput': True,
		'recommended': True,
		'vendor': '字节方舟',
	},
	{
		'id': 'doubao-seed-2-0-lite-260215',
		'label': '豆包 Seed 2.0 Lite',
		'supportsVision': True,
		'supportsStructuredOutput': True,
		'recommended': True,
		'vendor': '字节方舟',
	},
	{
		'id': 'doubao-seed-2-0-mini-260215',
		'label': '豆包 Seed 2.0 Mini',
		'supportsVision': True,
		'supportsStructuredOutput': True,
		'recommended': True,
		'vendor': '字节方舟',
	},
	{
		'id': 'doubao-seed-2-0-code-preview-260215',
		'label': '豆包 Seed 2.0 Code Preview',
		'supportsVision': True,
		'supportsStructuredOutput': True,
		'recommended': True,
		'vendor': '字节方舟',
	},
	{
		'id': 'doubao-seed-1-6-vision-250815',
		'label': '豆包 Seed 1.6 Vision',
		'supportsVision': True,
		'supportsStructuredOutput': True,
		'recommended': True,
		'vendor': '字节方舟',
	},
	{
		'id': 'doubao-seed-1-6-flash-250828',
		'label': '豆包 Seed 1.6 Flash',
		'supportsVision': True,
		'supportsStructuredOutput': True,
		'recommended': True,
		'vendor': '字节方舟',
	},
	{
		'id': 'doubao-seed-1-6-lite-251015',
		'label': '豆包 Seed 1.6 Lite',
		'supportsVision': True,
		'supportsStructuredOutput': False,
		'recommended': True,
		'vendor': '字节方舟',
	},
	{
		'id': 'doubao-seed-1-8-251228',
		'label': '豆包 Seed 1.8',
		'supportsVision': True,
		'supportsStructuredOutput': True,
		'recommended': True,
		'vendor': '字节方舟',
	},
]

DEFAULT_SCENE_UNDERSTAND_MODEL = 'doubao-seed-2-0-pro-260215'
ALLOW_SCENE_UNDERSTAND_MOCK_FALLBACK = str(os.environ.get('SCENE_UNDERSTAND_ALLOW_MOCK_FALLBACK', '')).strip().lower() in ('1', 'true', 'yes', 'on')

COLOR_WORDS = {
	'black', 'white', 'red', 'green', 'blue', 'yellow', 'brown', 'gray', 'grey', 'orange', 'pink', 'purple',
	'gold', 'silver', 'wood', 'wooden', 'beige', 'cyan', 'teal', 'navy', 'ivory',
	'黑', '白', '红', '绿', '蓝', '黄', '棕', '灰', '橙', '粉', '紫', '金', '银', '木', '木色', '米色'
}
NON_STRUCTURE_CATEGORIES = {'lighting', 'light', 'lamp', 'electronics', 'appliance', 'device'}
KEY_ELEMENT_TYPES = {'floor', 'wall', 'ceiling', 'roof', 'window', 'column', 'pillar', 'door', 'opening', 'builtin-fixture', 'fixed-installation'}

MAX_ARK_BASE64_IMAGE_BYTES = 10 * 1024 * 1024
SCENE_JSON_REWRITE_TRIGGER_CHARS = 10000
SCENE_JSON_REWRITE_MAX_ATTEMPTS = 2
SCENE_JSON_CONTINUATION_MAX_ATTEMPTS = 3
SCENE_JSON_CONTINUATION_OVERLAP_CHARS = 512
SCENE_UNDERSTAND_CONTEXT_TTL_SECONDS = 15 * 60


class RemoteProviderHttpError(RuntimeError):
	def __init__(self, status_code: int, detail: str, *, provider: str = 'volcengine-ark') -> None:
		super().__init__(detail)
		self.status_code = int(status_code)
		self.detail = str(detail or '')
		self.provider = provider


class RemoteProviderNetworkError(RuntimeError):
	def __init__(self, detail: str, *, provider: str = 'volcengine-ark') -> None:
		super().__init__(detail)
		self.detail = str(detail or '')
		self.provider = provider


class ModelResponseParseError(RuntimeError):
	def __init__(self, detail: str, *, raw_preview: str = '', provider: str = 'volcengine-ark') -> None:
		super().__init__(detail)
		self.detail = str(detail or '')
		self.raw_preview = str(raw_preview or '')
		self.provider = provider


def _is_context_cache_fallbackable_http_error(status_code: int, detail: str) -> bool:
	text = str(detail or '').strip().lower()
	if status_code == 404:
		return True
	return (
		'resourcenotfound' in text
		or 'specified resource is not found: endpoint' in text
		or '"param":"endpoint"' in text
		or 'context api' in text and 'not support' in text
		or 'context cache' in text and 'not support' in text
		or 'cache' in text and 'not enabled' in text
	)


def _normalize_env_key_fragment(value: str) -> str:
	return re.sub(r'[^a-z0-9]+', '_', str(value or '').strip().lower()).strip('_').upper()


def _resolve_context_model_id(model_id: str) -> str:
	resolved = str(model_id or '').strip()
	if not resolved:
		return ''
	if resolved.startswith('ep-'):
		return resolved
	model_option = _model_option(resolved) or {}
	option_endpoint = str(model_option.get('contextEndpointId') or model_option.get('endpointId') or '').strip()
	if option_endpoint:
		return option_endpoint
	model_env = os.environ.get(f'SCENE_UNDERSTAND_ARK_ENDPOINT_{_normalize_env_key_fragment(resolved)}', '')
	if str(model_env or '').strip():
		return str(model_env).strip()
	for key in (
		'SCENE_UNDERSTAND_ARK_CONTEXT_ENDPOINT_ID',
		'SCENE_UNDERSTAND_ARK_ENDPOINT_ID',
		'BYTEDANCE_ARK_CONTEXT_ENDPOINT_ID',
		'ARK_CONTEXT_ENDPOINT_ID',
	):
		value = str(os.environ.get(key, '') or '').strip()
		if value:
			return value
	return ''


def _extract_cached_tokens(usage: Any) -> Optional[int]:
	if not isinstance(usage, dict):
		return None
	prompt_details = usage.get('prompt_tokens_details')
	if not isinstance(prompt_details, dict):
		return None
	value = prompt_details.get('cached_tokens')
	if value is None:
		return None
	parsed = int(_to_float(value, 0.0) or 0)
	return max(0, parsed)


def _is_unsupported_json_object_error(detail: str) -> bool:
	text = str(detail or '').strip().lower()
	if not text:
		return False
	return 'response_format.type' in text and 'json_object' in text and 'not supported' in text


def _to_float(value: Any, default: float) -> float:
	try:
		number = float(value)
	except Exception:
		return default
	if math.isnan(number) or math.isinf(number):
		return default
	return number


def _normalize_rotation(raw: Any) -> Dict[str, float]:
	value = raw if isinstance(raw, dict) else {}
	return {
		'yaw': _to_float(value.get('yaw'), 0.0),
		'pitch': _to_float(value.get('pitch'), 0.0),
		'roll': _to_float(value.get('roll'), 0.0),
	}


def _normalize_scale(raw: Any) -> Dict[str, float]:
	value = raw if isinstance(raw, dict) else {}
	return {
		'x': max(0.01, _to_float(value.get('x'), 1.0)),
		'y': max(0.01, _to_float(value.get('y'), 1.0)),
		'z': max(0.01, _to_float(value.get('z'), 1.0)),
	}


def _normalize_name_key(item: Dict[str, Any]) -> str:
	parts = [str(item.get('name') or ''), str(item.get('category') or ''), str(item.get('subCategory') or '')]
	raw = ' '.join(parts).strip().lower()
	tokens = [tok for tok in re.split(r'[^a-z0-9\u4e00-\u9fff]+', raw) if tok]
	tokens = [tok for tok in tokens if tok not in COLOR_WORDS]
	return '-'.join(tokens) or 'object'


def _size_signature(item: Dict[str, Any]) -> tuple[float, float, float]:
	raw_size = item.get('size')
	size: Dict[str, Any] = raw_size if isinstance(raw_size, dict) else {}
	vals = sorted([
		max(0.01, _to_float(size.get('width'), 1.0)),
		max(0.01, _to_float(size.get('height'), 1.0)),
		max(0.01, _to_float(size.get('depth'), 1.0)),
	])
	return (vals[0], vals[1], vals[2])


def _size_similar(a: tuple[float, float, float], b: tuple[float, float, float]) -> bool:
	for av, bv in zip(a, b):
		base = max(av, bv, 0.01)
		if abs(av - bv) / base > 0.25:
			return False
	return True


def _text_match(value: str, words: List[str]) -> bool:
	v = str(value or '').strip().lower()
	if not v:
		return False
	return any(word in v for word in words)


def _semantic_structure_kind(item: Dict[str, Any]) -> str:
	semantic_role = str(item.get('semanticRole') or '').strip().lower()
	if semantic_role in ('wall-fixture', 'ceiling-fixture', 'support-object', 'prop', 'furniture'):
		return ''
	category = str(item.get('category') or '').strip().lower()
	sub = str(item.get('subCategory') or '').strip().lower()
	surface = str(item.get('surfaceType') or '').strip().lower()
	item_id = str(item.get('id') or '').strip().lower()
	placement = str(item.get('placement') or '').strip().lower()
	support_surface = str(item.get('supportSurface') or '').strip().lower()
	wall_role = _canonical_wall_role(item.get('wallRole'))
	semantic = ' '.join(part for part in [category, sub, surface] if part)
	if category in NON_STRUCTURE_CATEGORIES or sub in NON_STRUCTURE_CATEGORIES:
		return ''
	if _text_match(semantic, ['floor', 'ground', '地面', '地板', '地坪']):
		return 'floor'
	if _text_match(semantic, ['ceiling', 'roof', 'top-slab', '天花', '天花板', '顶面', '屋顶']) or placement == 'ceiling-shell' or support_surface == 'ceiling':
		return 'ceiling'
	if _text_match(semantic, ['wall', '墙面', '墙体']):
		return 'wall'
	if item_id.endswith('_wall') or item_id.startswith('wall_'):
		return 'wall'
	if item_id.endswith('_floor') or item_id.startswith('floor_') or item_id.startswith('floor'):
		return 'floor'
	if category in ('architecture', 'buildingcomponent', 'building_component', 'structure') and (
		item_id.endswith('_ceiling') or item_id.startswith('ceiling_') or item_id.startswith('ceiling') or item_id.startswith('roof_') or item_id.startswith('roof')
	):
		return 'ceiling'
	if semantic:
		return ''
	name = str(item.get('name') or '').strip().lower()
	if name.endswith('墙') or name.endswith('wall') or ('墙面' in name) or ('墙体' in name):
		return 'wall'
	if _text_match(name, ['floor', 'ground', '地面', '地板', '地坪']):
		return 'floor'
	if _text_match(name, ['ceiling', 'roof', '天花', '天花板', '顶面', '屋顶']):
		return 'ceiling'
	return ''


def _is_floor_like(item: Dict[str, Any]) -> bool:
	return _semantic_structure_kind(item) == 'floor'


def _is_wall_like(item: Dict[str, Any]) -> bool:
	return _semantic_structure_kind(item) == 'wall'


def _is_ceiling_like(item: Dict[str, Any]) -> bool:
	return _semantic_structure_kind(item) == 'ceiling'


def _canonical_wall_role(value: Any) -> str:
	raw = str(value or '').strip().lower()
	if not raw:
		return ''
	if any(token in raw for token in ['left', '左墙', '左侧墙', '左侧墙面']):
		return 'left'
	if any(token in raw for token in ['right', '右墙', '右侧墙', '右侧墙面']):
		return 'right'
	if any(token in raw for token in ['back', 'rear', '后墙', '后侧墙', '后侧墙面']):
		return 'back'
	if any(token in raw for token in ['front', '前墙', '前侧墙', '前侧墙面']):
		return 'front'
	return raw


def _nearest_cardinal_yaw(yaw: float) -> float:
	angles = [0.0, 90.0, 180.0, 270.0, 360.0]
	y = yaw % 360.0
	best = min(angles, key=lambda target: abs(target - y))
	return 0.0 if best >= 360.0 else best


def _normalize_bottom_y(position_y: float, height: float, *, force_floor: bool = False, force_wall: bool = False) -> float:
	if force_floor:
		return 0.0
	if force_wall:
		return max(0.0, position_y - height * 0.5)
	if position_y >= height * 0.6:
		return max(0.0, position_y - height * 0.5)
	return max(0.0, position_y)


def _as_dict(raw: Any) -> Dict[str, Any]:
	return dict(raw) if isinstance(raw, dict) else {}


def _apply_interior_geometry_constraints(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	if not items:
		return items

	floor_candidates = [item for item in items if _is_floor_like(item)]
	if floor_candidates:
		anchor = min(
			floor_candidates,
			key=lambda item: (
				abs(_to_float((item.get('position') or {}).get('y'), 0.0)),
				-_to_float((item.get('size') or {}).get('width'), 1.0) * _to_float((item.get('size') or {}).get('depth'), 1.0),
			),
		)
		anchor_y = _to_float((anchor.get('position') or {}).get('y'), 0.0)
		if abs(anchor_y) > 1e-6:
			for item in items:
				raw_position = item.get('position')
				position: Dict[str, Any] = dict(raw_position) if isinstance(raw_position, dict) else {}
				position['y'] = _to_float(position.get('y'), 0.0) - anchor_y
				item['position'] = position

	for item in items:
		raw_position = item.get('position')
		raw_size = item.get('size')
		raw_rotation = item.get('rotation')
		position: Dict[str, Any] = dict(raw_position) if isinstance(raw_position, dict) else {}
		size: Dict[str, Any] = dict(raw_size) if isinstance(raw_size, dict) else {}
		rotation: Dict[str, Any] = dict(raw_rotation) if isinstance(raw_rotation, dict) else {}

		height = max(0.05, _to_float(size.get('height'), 1.0))
		is_floor = _is_floor_like(item)
		is_wall = _is_wall_like(item)

		position['y'] = _normalize_bottom_y(
			_to_float(position.get('y'), 0.0),
			height,
			force_floor=is_floor,
			force_wall=is_wall,
		)

		if is_floor:
			rotation['yaw'] = 0.0
			rotation['pitch'] = 0.0
			rotation['roll'] = 0.0
		elif is_wall:
			rotation['yaw'] = _nearest_cardinal_yaw(_to_float(rotation.get('yaw'), 0.0))
			rotation['pitch'] = 0.0
			rotation['roll'] = 0.0

		item['position'] = position
		item['rotation'] = rotation

	return items


def _effective_size(item: Dict[str, Any]) -> Dict[str, float]:
	size = _as_dict(item.get('size'))
	scale = _as_dict(item.get('scale'))
	return {
		'width': max(0.05, _to_float(size.get('width'), 1.0) * _to_float(scale.get('x'), 1.0)),
		'height': max(0.05, _to_float(size.get('height'), 1.0) * _to_float(scale.get('y'), 1.0)),
		'depth': max(0.05, _to_float(size.get('depth'), 1.0) * _to_float(scale.get('z'), 1.0)),
	}


def _item_volume(item: Dict[str, Any]) -> float:
	size = _effective_size(item)
	return size['width'] * size['height'] * size['depth']


def _normalize_relation_fields(item: Dict[str, Any]) -> Dict[str, Any]:
	item['parentId'] = str(item.get('parentId') or '').strip()
	item['placement'] = str(item.get('placement') or '').strip().lower()
	item['supportSurface'] = str(item.get('supportSurface') or '').strip().lower()
	item['anchor'] = str(item.get('anchor') or '').strip().lower()
	item['wallRole'] = _canonical_wall_role(item.get('wallRole'))
	item['proximityGroupId'] = str(item.get('proximityGroupId') or '').strip()
	item['relationReason'] = str(item.get('relationReason') or '').strip()
	item['inferred'] = bool(item.get('inferred'))
	item['isKeyElement'] = bool(item.get('isKeyElement'))
	item['keyElementType'] = str(item.get('keyElementType') or '').strip().lower()
	item['fixedInRoom'] = bool(item.get('fixedInRoom'))
	item['semanticRole'] = str(item.get('semanticRole') or '').strip().lower()
	item['mountType'] = str(item.get('mountType') or '').strip().lower()
	relation_tags = item.get('relationTags')
	item['relationTags'] = [str(tag or '').strip().lower() for tag in relation_tags] if isinstance(relation_tags, list) else []
	item['layoutPriority'] = _to_float(item.get('layoutPriority'), 0.0)
	raw_ground = item.get('shouldTouchGround')
	if isinstance(raw_ground, bool):
		item['shouldTouchGround'] = raw_ground
	else:
		raw_ground_text = str(raw_ground or '').strip().lower()
		if raw_ground_text in ('true', '1', 'yes', 'on', '是'):
			item['shouldTouchGround'] = True
		elif raw_ground_text in ('false', '0', 'no', 'off', '否'):
			item['shouldTouchGround'] = False
		else:
			item['shouldTouchGround'] = None
	item['groundReason'] = str(item.get('groundReason') or '').strip()
	raw_indices = item.get('observedImageIndices')
	observed_indices: List[int] = []
	if isinstance(raw_indices, list):
		for raw_idx in raw_indices:
			idx = int(_to_float(raw_idx, 0.0) or 0)
			if idx > 0 and idx not in observed_indices:
				observed_indices.append(idx)
	source_index = max(1, int(_to_float(item.get('sourceImageIndex'), 1.0) or 1))
	if source_index not in observed_indices:
		observed_indices.append(source_index)
	item['observedImageIndices'] = observed_indices
	return item


def _infer_should_touch_ground(item: Dict[str, Any]) -> bool:
	placement = str(item.get('placement') or '').strip().lower()
	mount_type = str(item.get('mountType') or '').strip().lower()
	support_surface = str(item.get('supportSurface') or '').strip().lower()
	semantic_role = str(item.get('semanticRole') or '').strip().lower()
	key_element_type = str(item.get('keyElementType') or '').strip().lower()
	category = str(item.get('category') or '').strip().lower()
	sub_category = str(item.get('subCategory') or '').strip().lower()
	name = str(item.get('name') or '').strip().lower()
	tokens = f'{category} {sub_category} {name} {semantic_role} {key_element_type}'
	if placement == 'on-top' or mount_type == 'support-top':
		return False
	if placement == 'attached-to-ceiling' or support_surface == 'ceiling' or mount_type == 'ceiling':
		return False
	if placement == 'on-floor' or support_surface == 'floor' or mount_type == 'floor':
		return True
	if key_element_type in ('floor', 'wall', 'ceiling', 'roof'):
		return key_element_type in ('floor', 'wall')
	if any(word in tokens for word in ['bookshelf', 'bookcase', 'wardrobe', 'closet', 'cabinet', 'display-case', 'display cabinet', 'console', 'locker', 'shelf', '书柜', '书架', '衣柜', '展示柜', '柜', '控制台']):
		return True
	if any(word in tokens for word in ['monitor', 'screen', 'painting', 'poster', 'wall-light', 'sconce', 'mirror', '显示屏', '屏幕', '挂画', '壁灯', '镜子']):
		return False
	if placement == 'attached-to-wall' and mount_type in ('wall', 'embedded-wall'):
		return bool(_to_float((_as_dict(item.get('position'))).get('y'), 0.0) <= 0.12)
	return bool(_to_float((_as_dict(item.get('position'))).get('y'), 0.0) <= 0.08)


def _infer_key_element_type(item: Dict[str, Any]) -> str:
	explicit = str(item.get('keyElementType') or '').strip().lower()
	if explicit:
		return explicit
	kind = _semantic_structure_kind(item)
	if kind:
		return kind
	category = str(item.get('category') or '').strip().lower()
	sub = str(item.get('subCategory') or '').strip().lower()
	name = str(item.get('name') or '').strip().lower()
	tokens = f'{category} {sub} {name}'
	if _text_match(tokens, ['window', '窗', '百叶窗', '窗户']):
		return 'window'
	if _text_match(tokens, ['column', 'pillar', '柱', '立柱']):
		return 'column'
	if _text_match(tokens, ['door', '门', '门洞']):
		return 'door'
	if _text_match(tokens, ['opening', '开口', '门洞']):
		return 'opening'
	if str(item.get('placement') or '').strip().lower() == 'attached-to-wall' and _text_match(tokens, ['bookshelf', 'displaycabinet', 'cabinet', 'shelf', '书架', '展示柜', '柜']):
		return 'builtin-fixture'
	return ''


def _infer_mount_type(item: Dict[str, Any], key_element_type: str) -> str:
	explicit = str(item.get('mountType') or '').strip().lower()
	if explicit:
		return explicit
	placement = str(item.get('placement') or '').strip().lower()
	support_surface = str(item.get('supportSurface') or '').strip().lower()
	if key_element_type in ('floor',):
		return 'floor'
	if key_element_type in ('wall',):
		return 'wall'
	if key_element_type in ('ceiling', 'roof'):
		return 'ceiling'
	if key_element_type in ('window', 'door', 'opening', 'column', 'pillar'):
		return 'embedded-wall' if support_surface in ('back', 'front', 'left', 'right', 'wall') or placement == 'attached-to-wall' else 'free'
	if placement == 'attached-to-wall':
		category = str(item.get('category') or '').strip().lower()
		sub = str(item.get('subCategory') or '').strip().lower()
		name = str(item.get('name') or '').strip().lower()
		tokens = f'{category} {sub} {name}'
		if _text_match(tokens, ['bookshelf', 'displaycabinet', 'cabinet', 'shelf', '书架', '展示柜', '柜', 'window', '窗']):
			return 'embedded-wall'
		return 'wall'
	if placement == 'attached-to-ceiling' or support_surface == 'ceiling':
		return 'ceiling'
	if placement == 'on-top':
		return 'support-top'
	if placement == 'on-floor' or support_surface == 'floor':
		return 'floor'
	return 'free'


def _apply_layout_semantics(item: Dict[str, Any]) -> Dict[str, Any]:
	item = _normalize_relation_fields(item)
	key_element_type = _infer_key_element_type(item)
	is_key_element = bool(item.get('isKeyElement')) or key_element_type in KEY_ELEMENT_TYPES
	mount_type = _infer_mount_type(item, key_element_type)
	semantic_role = str(item.get('semanticRole') or '').strip().lower()
	if not semantic_role:
		if key_element_type in ('floor', 'wall', 'ceiling', 'roof'):
			semantic_role = 'structure-shell'
		elif key_element_type in ('window', 'door', 'opening'):
			semantic_role = 'architectural-opening'
		elif key_element_type in ('column', 'pillar'):
			semantic_role = 'architectural-fixed'
		elif key_element_type == 'builtin-fixture' or mount_type == 'embedded-wall':
			semantic_role = 'built-in-fixture'
		elif mount_type == 'wall':
			semantic_role = 'wall-fixture'
		elif mount_type == 'ceiling':
			semantic_role = 'ceiling-fixture'
		elif mount_type == 'floor':
			semantic_role = 'floor-object'
		elif mount_type == 'support-top':
			semantic_role = 'support-object'
		else:
			semantic_role = 'furniture'
	relation_tags = [str(tag or '').strip().lower() for tag in item.get('relationTags') or [] if str(tag or '').strip()]
	if is_key_element and 'key-element' not in relation_tags:
		relation_tags.append('key-element')
	if semantic_role == 'structure-shell' and 'structural-shell' not in relation_tags:
		relation_tags.append('structural-shell')
	if mount_type == 'wall' and 'wall-attached' not in relation_tags:
		relation_tags.append('wall-attached')
	if mount_type == 'embedded-wall' and 'embedded' not in relation_tags:
		relation_tags.extend([tag for tag in ['wall-attached', 'embedded'] if tag not in relation_tags])
	if mount_type == 'ceiling' and 'ceiling-attached' not in relation_tags:
		relation_tags.append('ceiling-attached')
	if mount_type == 'floor' and 'floor-supported' not in relation_tags:
		relation_tags.append('floor-supported')
	if semantic_role == 'architectural-opening' and 'opening' not in relation_tags:
		relation_tags.append('opening')
	fixed_in_room = bool(item.get('fixedInRoom')) or key_element_type in {'floor', 'wall', 'ceiling', 'roof', 'window', 'column', 'pillar', 'door', 'opening'}
	priority = _to_float(item.get('layoutPriority'), 0.0)
	if priority <= 0:
		if semantic_role == 'structure-shell':
			priority = 100.0
		elif fixed_in_room:
			priority = 90.0
		elif mount_type in ('embedded-wall', 'wall', 'ceiling'):
			priority = 70.0
		elif mount_type == 'support-top':
			priority = 50.0
		else:
			priority = 30.0
	item['keyElementType'] = key_element_type
	item['isKeyElement'] = is_key_element
	item['fixedInRoom'] = fixed_in_room
	item['semanticRole'] = semantic_role
	item['mountType'] = mount_type
	item['relationTags'] = relation_tags
	item['layoutPriority'] = priority
	return item


def _build_key_elements_summary(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	summary: List[Dict[str, Any]] = []
	for item in items:
		if not bool(item.get('isKeyElement')):
			continue
		summary.append({
			'id': str(item.get('id') or ''),
			'type': str(item.get('keyElementType') or ''),
			'role': str(item.get('semanticRole') or ''),
			'fixed': bool(item.get('fixedInRoom')),
			'mountType': str(item.get('mountType') or ''),
			'priority': _to_float(item.get('layoutPriority'), 0.0),
			'relationTags': [str(tag or '').strip().lower() for tag in item.get('relationTags') or [] if str(tag or '').strip()],
		})
	return summary


def _is_large_anchor_like(item: Dict[str, Any]) -> bool:
	if _is_floor_like(item) or _is_wall_like(item):
		return False
	name = str(item.get('name') or '').lower()
	category = str(item.get('category') or '').lower()
	tokens = f'{category} {name}'
	if _text_match(tokens, ['table', 'desk', 'cabinet', 'shelf', 'sofa', 'bed', 'tv-stand', '柜', '桌', '台', '架', '沙发', '床']):
		return True
	size = _effective_size(item)
	return _item_volume(item) >= 1.25 or (size['width'] >= 1.0 and size['depth'] >= 0.45)


def _top_y(item: Dict[str, Any]) -> float:
	position = _as_dict(item.get('position'))
	return _to_float(position.get('y'), 0.0) + _effective_size(item)['height']


def _half_extents_xz(item: Dict[str, Any]) -> tuple[float, float]:
	size = _effective_size(item)
	yaw = _nearest_cardinal_yaw(_to_float(_as_dict(item.get('rotation')).get('yaw'), 0.0))
	if yaw in (90.0, 270.0):
		return size['depth'] * 0.5, size['width'] * 0.5
	return size['width'] * 0.5, size['depth'] * 0.5


def _bounds_xz(item: Dict[str, Any]) -> tuple[float, float, float, float]:
	position = _as_dict(item.get('position'))
	half_x, half_z = _half_extents_xz(item)
	center_x = _to_float(position.get('x'), 0.0)
	center_z = _to_float(position.get('z'), 0.0)
	return center_x - half_x, center_x + half_x, center_z - half_z, center_z + half_z


def _infer_wall_roles(items: List[Dict[str, Any]]) -> None:
	for item in items:
		if not _is_wall_like(item):
			continue
		role = _canonical_wall_role(item.get('wallRole'))
		if role:
			item['wallRole'] = role
			continue
		position = _as_dict(item.get('position'))
		rotation = _as_dict(item.get('rotation'))
		yaw = _nearest_cardinal_yaw(_to_float(rotation.get('yaw'), 0.0))
		if yaw in (0.0, 180.0):
			item['wallRole'] = 'front' if _to_float(position.get('z'), 0.0) <= 0.0 else 'back'
		else:
			item['wallRole'] = 'left' if _to_float(position.get('x'), 0.0) <= 0.0 else 'right'


def _find_top_support(item: Dict[str, Any], candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
	position = _as_dict(item.get('position'))
	child_size = _effective_size(item)
	best: Optional[Dict[str, Any]] = None
	best_score = 10**9
	for candidate in candidates:
		if candidate.get('id') == item.get('id'):
			continue
		candidate_size = _effective_size(candidate)
		overlap_x = (candidate_size['width'] - child_size['width']) * 0.5 + 0.22
		overlap_z = (candidate_size['depth'] - child_size['depth']) * 0.5 + 0.22
		candidate_pos = _as_dict(candidate.get('position'))
		dx = abs(_to_float(position.get('x'), 0.0) - _to_float(candidate_pos.get('x'), 0.0))
		dz = abs(_to_float(position.get('z'), 0.0) - _to_float(candidate_pos.get('z'), 0.0))
		if dx > max(0.15, overlap_x) or dz > max(0.15, overlap_z):
			continue
		delta_y = abs(_to_float(position.get('y'), 0.0) - _top_y(candidate))
		if delta_y > max(0.2, child_size['height'] * 0.9):
			continue
		score = delta_y + dx * 0.35 + dz * 0.35 - _item_volume(candidate) * 0.02
		if score < best_score:
			best = candidate
			best_score = score
	return best


def _find_wall_parent(item: Dict[str, Any], walls: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
	position = _as_dict(item.get('position'))
	child_size = _effective_size(item)
	best: Optional[Dict[str, Any]] = None
	best_score = 10**9
	for wall in walls:
		wall_position = _as_dict(wall.get('position'))
		wall_rotation = _as_dict(wall.get('rotation'))
		wall_size = _effective_size(wall)
		yaw = _nearest_cardinal_yaw(_to_float(wall_rotation.get('yaw'), 0.0))
		if yaw in (0.0, 180.0):
			distance = abs(_to_float(position.get('z'), 0.0) - _to_float(wall_position.get('z'), 0.0))
			lateral = abs(_to_float(position.get('x'), 0.0) - _to_float(wall_position.get('x'), 0.0))
			limit = wall_size['width'] * 0.5 + 0.3
		else:
			distance = abs(_to_float(position.get('x'), 0.0) - _to_float(wall_position.get('x'), 0.0))
			lateral = abs(_to_float(position.get('z'), 0.0) - _to_float(wall_position.get('z'), 0.0))
			limit = wall_size['width'] * 0.5 + 0.3
		if lateral > max(0.25, limit):
			continue
		if _to_float(position.get('y'), 0.0) < max(0.35, child_size['height'] * 0.3):
			continue
		if distance > max(0.35, child_size['depth'] * 1.6):
			continue
		score = distance + lateral * 0.2
		if score < best_score:
			best = wall
			best_score = score
	return best


def _find_near_wall(item: Dict[str, Any], walls: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
	position = _as_dict(item.get('position'))
	best: Optional[Dict[str, Any]] = None
	best_score = 10**9
	for wall in walls:
		wall_position = _as_dict(wall.get('position'))
		wall_rotation = _as_dict(wall.get('rotation'))
		wall_size = _effective_size(wall)
		yaw = _nearest_cardinal_yaw(_to_float(wall_rotation.get('yaw'), 0.0))
		if yaw in (0.0, 180.0):
			distance = abs(_to_float(position.get('z'), 0.0) - _to_float(wall_position.get('z'), 0.0))
			lateral = abs(_to_float(position.get('x'), 0.0) - _to_float(wall_position.get('x'), 0.0))
			limit = wall_size['width'] * 0.5 + 0.45
		else:
			distance = abs(_to_float(position.get('x'), 0.0) - _to_float(wall_position.get('x'), 0.0))
			lateral = abs(_to_float(position.get('z'), 0.0) - _to_float(wall_position.get('z'), 0.0))
			limit = wall_size['width'] * 0.5 + 0.45
		if lateral > max(0.35, limit):
			continue
		if distance > 1.3:
			continue
		score = distance + lateral * 0.2
		if score < best_score:
			best = wall
			best_score = score
	return best


def _canonical_wall_role_yaw(role: str) -> float:
	if role == 'left':
		return 90.0
	if role == 'right':
		return 270.0
	if role == 'back':
		return 180.0
	return 0.0


def _is_wall_aligned_surface(item: Dict[str, Any]) -> bool:
	if _is_wall_like(item):
		return True
	placement = str(item.get('placement') or '').strip().lower()
	mount_type = str(item.get('mountType') or '').strip().lower()
	support_surface = str(item.get('supportSurface') or '').strip().lower()
	if placement in ('attached-to-wall', 'embedded-wall', 'embedded-inside'):
		return True
	if mount_type in ('wall', 'embedded-wall'):
		return True
	if support_surface in ('wall', 'left', 'right', 'front', 'back'):
		return True
	return bool(_canonical_wall_role(item.get('wallRole')))


def _canonicalize_wall_aligned_geometry(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	for item in items:
		if not _is_wall_aligned_surface(item):
			continue
		role = _canonical_wall_role(item.get('wallRole'))
		if not role:
			role = _resolve_wall_role_from_geometry(item) if _is_wall_like(item) else ''
		if role not in ('left', 'right', 'front', 'back'):
			continue
		size = _as_dict(item.get('size'))
		rotation = _as_dict(item.get('rotation'))
		width = max(0.05, _to_float(size.get('width'), 1.0))
		depth = max(0.05, _to_float(size.get('depth'), 1.0))
		along_wall = max(width, depth)
		thickness = min(width, depth)
		item['wallRole'] = role
		size['width'] = along_wall
		size['depth'] = thickness
		rotation['yaw'] = _canonical_wall_role_yaw(role)
		rotation['pitch'] = 0.0
		rotation['roll'] = 0.0
		item['size'] = size
		item['rotation'] = rotation
	return items


def _snap_wall_attached_items_to_parent_surface(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	if not items:
		return items
	items_by_id = {str(item.get('id') or '').strip(): item for item in items}
	for item in items:
		if _is_wall_like(item):
			continue
		placement = str(item.get('placement') or '').strip().lower()
		parent_id = str(item.get('parentId') or '').strip()
		if placement != 'attached-to-wall' or not parent_id:
			continue
		parent = items_by_id.get(parent_id)
		if parent is None or not _is_wall_like(parent):
			continue
		role = _canonical_wall_role(item.get('wallRole')) or _canonical_wall_role(parent.get('wallRole')) or _resolve_wall_role_from_geometry(parent)
		if role not in ('left', 'right', 'front', 'back'):
			continue
		parent_position = _as_dict(parent.get('position'))
		parent_size = _effective_size(parent)
		child_size = _effective_size(item)
		position = _as_dict(item.get('position'))
		gap = 0.01
		if role == 'left':
			position['x'] = _to_float(parent_position.get('x'), 0.0) + parent_size['depth'] * 0.5 + child_size['depth'] * 0.5 + gap
		elif role == 'right':
			position['x'] = _to_float(parent_position.get('x'), 0.0) - parent_size['depth'] * 0.5 - child_size['depth'] * 0.5 - gap
		elif role == 'back':
			position['z'] = _to_float(parent_position.get('z'), 0.0) + parent_size['depth'] * 0.5 + child_size['depth'] * 0.5 + gap
		else:
			position['z'] = _to_float(parent_position.get('z'), 0.0) - parent_size['depth'] * 0.5 - child_size['depth'] * 0.5 - gap
		item['position'] = position
		item['wallRole'] = role
		support_surface = str(item.get('supportSurface') or '').strip().lower()
		if support_surface in ('', 'wall', 'interior-front', 'interior-back', 'interior-left', 'interior-right', 'front', 'back', 'left', 'right'):
			item['supportSurface'] = role
		if str(item.get('mountType') or '').strip().lower() in ('', 'free'):
			item['mountType'] = 'wall'
	return items


def _create_inferred_support(item: Dict[str, Any], *, existing_ids: set[str]) -> Optional[Dict[str, Any]]:
	if _is_floor_like(item) or _is_wall_like(item):
		return None
	position = _as_dict(item.get('position'))
	if _to_float(position.get('y'), 0.0) <= 0.25:
		return None
	child_size = _effective_size(item)
	support_id = f"{item.get('id') or 'item'}-support"
	while support_id in existing_ids:
		support_id = f'{support_id}-x'
	height = max(0.35, min(_to_float(position.get('y'), 0.0), max(0.55, child_size['height'] * 1.15)))
	return {
		'id': support_id,
		'name': f"hidden_support_for_{item.get('id') or 'item'}",
		'category': 'support',
		'subCategory': 'inferred-support',
		'material': 'wood',
		'surfaceType': 'support-top',
		'wallRole': '',
		'sameTypeGroupId': 'inferred-support-group',
		'sameTypeGroupLabel': 'Inferred Supports',
		'sameTypeReason': '为消除悬空关系自动补出的支撑物。',
		'parentId': '',
		'placement': 'on-floor',
		'supportSurface': 'floor',
		'anchor': 'center',
		'proximityGroupId': str(item.get('proximityGroupId') or ''),
		'relationReason': f"为 {item.get('name') or item.get('id') or 'object'} 推断隐藏支撑面。",
		'inferred': True,
		'position': {
			'x': _to_float(position.get('x'), 0.0),
			'y': 0.0,
			'z': _to_float(position.get('z'), 0.0),
		},
		'rotation': {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0},
		'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
		'size': {
			'width': max(0.28, child_size['width'] * 0.72),
			'height': height,
			'depth': max(0.28, child_size['depth'] * 0.72),
		},
		'imageRect': {'x': 0.0, 'y': 0.0, 'width': 0.0, 'height': 0.0},
		'description': 'Automatically inferred hidden support.',
	}


def _create_inferred_remote_support(item: Dict[str, Any], wall: Dict[str, Any], *, existing_ids: set[str]) -> Optional[Dict[str, Any]]:
	if _is_floor_like(item) or _is_wall_like(item):
		return None
	position = _as_dict(item.get('position'))
	child_size = _effective_size(item)
	wall_role = _canonical_wall_role(wall.get('wallRole')) or 'back'
	support_id = f"{item.get('id') or 'item'}-rear-support"
	while support_id in existing_ids:
		support_id = f'{support_id}-x'
	is_window_sill = _to_float(position.get('y'), 0.0) >= 0.85
	if is_window_sill:
		support_height = 0.14
		support = {
			'id': support_id,
			'name': f"hidden_window_sill_for_{item.get('id') or 'item'}",
			'category': 'furniture',
			'subCategory': 'window-sill',
			'material': 'stone',
			'surfaceType': 'support-top',
			'wallRole': wall_role,
			'sameTypeGroupId': 'inferred-remote-support-group',
			'sameTypeGroupLabel': 'Inferred Remote Supports',
			'sameTypeReason': '为远处遮挡物体推断的窗台/窄台面。',
			'parentId': str(wall.get('id') or ''),
			'placement': 'attached-to-wall',
			'supportSurface': wall_role or 'wall',
			'anchor': 'center',
			'proximityGroupId': str(item.get('proximityGroupId') or ''),
			'relationReason': f"为远处物体 {item.get('name') or item.get('id') or 'object'} 推断贴墙窗台/窄台面承托。",
			'inferred': True,
			'position': {
				'x': _to_float(position.get('x'), 0.0),
				'y': max(0.55, _to_float(position.get('y'), 0.0) - support_height),
				'z': _to_float(position.get('z'), 0.0),
			},
			'rotation': {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0},
			'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
			'size': {
				'width': max(0.8, child_size['width'] * 1.8),
				'height': support_height,
				'depth': max(0.28, child_size['depth'] * 1.4),
			},
			'imageRect': {'x': 0.0, 'y': 0.0, 'width': 0.0, 'height': 0.0},
			'description': 'Automatically inferred rear window sill support.',
		}
		return support

	height = max(0.68, min(1.0, _to_float(position.get('y'), 0.0) + child_size['height'] * 0.1))
	return {
		'id': support_id,
		'name': f"hidden_rear_table_for_{item.get('id') or 'item'}",
		'category': 'furniture',
		'subCategory': 'rear-console-table',
		'material': 'wood+metal',
		'surfaceType': 'support-top',
		'wallRole': wall_role,
		'sameTypeGroupId': 'inferred-remote-support-group',
		'sameTypeGroupLabel': 'Inferred Remote Supports',
		'sameTypeReason': '为远处遮挡物体推断的桌面/窗下柜承托。',
		'parentId': '',
		'placement': 'on-floor',
		'supportSurface': 'floor',
		'anchor': 'center',
		'proximityGroupId': str(item.get('proximityGroupId') or ''),
		'relationReason': f"为远处物体 {item.get('name') or item.get('id') or 'object'} 推断靠墙桌面/窗下柜承托。",
		'inferred': True,
		'position': {
			'x': _to_float(position.get('x'), 0.0),
			'y': 0.0,
			'z': _to_float(position.get('z'), 0.0),
		},
		'rotation': {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0},
		'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
		'size': {
			'width': max(0.95, child_size['width'] * 1.9),
			'height': height,
			'depth': max(0.45, child_size['depth'] * 1.8),
		},
		'imageRect': {'x': 0.0, 'y': 0.0, 'width': 0.0, 'height': 0.0},
		'description': 'Automatically inferred rear support desk/cabinet.',
	}


def _should_infer_remote_support(item: Dict[str, Any], wall: Dict[str, Any]) -> bool:
	if _is_large_anchor_like(item):
		return False
	wall_role = _canonical_wall_role(wall.get('wallRole'))
	if wall_role not in ('back', 'front', 'left', 'right'):
		return False
	position = _as_dict(item.get('position'))
	image_rect = _as_dict(item.get('imageRect'))
	child_size = _effective_size(item)
	height = _to_float(position.get('y'), 0.0)
	image_h = _to_float(image_rect.get('height'), 0.0)
	image_y = _to_float(image_rect.get('y'), 0.0)
	if height >= 0.25:
		return True
	if image_h > 0 and image_h <= 0.16 and image_y >= 0.3:
		return True
	return child_size['width'] <= 0.9 and child_size['depth'] <= 0.9


def _ceiling_mount_allowed(item: Dict[str, Any]) -> bool:
	if _is_ceiling_like(item):
		return True
	tokens = ' '.join([
		str(item.get('category') or '').strip().lower(),
		str(item.get('subCategory') or '').strip().lower(),
		str(item.get('name') or '').strip().lower(),
		str(item.get('semanticRole') or '').strip().lower(),
		str(item.get('keyElementType') or '').strip().lower(),
		str(item.get('surfaceType') or '').strip().lower(),
	])
	return _text_match(tokens, [
		'ceiling-light', 'light', 'lamp', '吊灯', '吸顶灯', '灯具', '灯组',
		'fan', 'ceiling fan', '风扇', 'projector', '投影', 'camera', '摄像头',
		'sprinkler', '喷淋', 'smoke detector', '烟感', 'wire', 'cable', '线缆',
		'duct', 'vent', '通风', '风口'
	])


def _wall_supported_surface_like(item: Dict[str, Any]) -> bool:
	tokens = ' '.join([
		str(item.get('category') or '').strip().lower(),
		str(item.get('subCategory') or '').strip().lower(),
		str(item.get('name') or '').strip().lower(),
		str(item.get('surfaceType') or '').strip().lower(),
	])
	return _text_match(tokens, [
		'desk', 'table', 'workbench', 'workstation', 'counter', 'console', 'bench',
		'board', 'desk-board', 'shelf-board', '电脑桌', '桌', '台', '工作台', '工位',
		'操作台', '桌板', '台板', '台面', '长桌', '长台', '壁挂桌'
	])


def _desktop_electronics_like(item: Dict[str, Any]) -> bool:
	tokens = ' '.join([
		str(item.get('category') or '').strip().lower(),
		str(item.get('subCategory') or '').strip().lower(),
		str(item.get('name') or '').strip().lower(),
		str(item.get('surfaceType') or '').strip().lower(),
	])
	return _text_match(tokens, [
		'computer', 'pc', 'desktop computer', 'terminal', 'monitor', 'screen', 'display',
		'keyboard', 'mouse', 'laptop', 'printer', '电脑', '计算机', '主机', '终端',
		'显示器', '屏幕', '键盘', '鼠标', '打印机'
	])


def _support_surface_like(item: Dict[str, Any]) -> bool:
	return _is_large_anchor_like(item) or _wall_supported_surface_like(item)


def _wall_aligned_span_axes(item: Dict[str, Any]) -> Tuple[str, str]:
	role = _canonical_wall_role(item.get('wallRole'))
	if role in ('left', 'right'):
		return 'z', 'x'
	return 'x', 'z'


def _needs_wall_surface_compaction(item: Dict[str, Any]) -> bool:
	if not _wall_supported_surface_like(item):
		return False
	if _is_wall_like(item):
		return False
	size = _effective_size(item)
	placement = str(item.get('placement') or '').strip().lower()
	mount_type = str(item.get('mountType') or '').strip().lower()
	relation_tags = {str(tag or '').strip().lower() for tag in item.get('relationTags') or []}
	wallish = (
		placement == 'attached-to-wall'
		or mount_type == 'wall'
		or 'wall-attached' in relation_tags
		or _canonical_wall_role(item.get('wallRole')) in ('left', 'right', 'front', 'back')
	)
	if not wallish:
		return False
	return size['height'] > 0.22 or size['depth'] > 1.35 or (placement == 'on-floor' and mount_type == 'wall')


def _normalize_wall_supported_surface_geometry(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	if not items:
		return items
	items_by_id = {str(item.get('id') or '').strip(): item for item in items}
	walls = [item for item in items if _is_wall_like(item)]
	children_by_parent: Dict[str, List[Dict[str, Any]]] = {}
	for item in items:
		parent_id = str(item.get('parentId') or '').strip()
		if not parent_id:
			continue
		if str(item.get('placement') or '').strip().lower() != 'on-top':
			continue
		children_by_parent.setdefault(parent_id, []).append(item)
	for item in items:
		if not _needs_wall_surface_compaction(item):
			continue
		parent = items_by_id.get(str(item.get('parentId') or '').strip())
		wall_parent = parent if parent is not None and _is_wall_like(parent) else _find_near_wall(item, walls)
		role = _canonical_wall_role(item.get('wallRole')) or _canonical_wall_role((wall_parent or {}).get('wallRole'))
		if not role:
			continue
		children = children_by_parent.get(str(item.get('id') or '').strip()) or []
		size = _effective_size(item)
		min_x, max_x, min_z, max_z = _bounds_xz(item)
		child_top_levels = [_to_float(_as_dict(child.get('position')).get('y'), 0.0) for child in children]
		if children:
			min_x = min(_bounds_xz(child)[0] for child in children)
			max_x = max(_bounds_xz(child)[1] for child in children)
			min_z = min(_bounds_xz(child)[2] for child in children)
			max_z = max(_bounds_xz(child)[3] for child in children)
		child_span_x = max(0.0, max_x - min_x)
		child_span_z = max(0.0, max_z - min_z)
		along_axis, outward_axis = _wall_aligned_span_axes({'wallRole': role})
		along_span = child_span_z if along_axis == 'z' else child_span_x
		outward_span = child_span_x if outward_axis == 'x' else child_span_z
		max_child_width = max((_effective_size(child)['width'] for child in children), default=0.45)
		max_child_depth = max((_effective_size(child)['depth'] for child in children), default=0.45)
		along_margin = max(0.18, max_child_width * 0.45)
		outward_margin = max(0.12, max_child_depth * 0.3)
		required_width = max(size['width'], along_span + along_margin * 2)
		required_depth = max(0.45, outward_span + outward_margin * 2)
		required_depth = min(required_depth, max(0.6, min(required_width * 0.18, 1.05)))
		thickness = 0.1
		tabletop_top = min(child_top_levels) if child_top_levels else _top_y(item)
		item['size']['width'] = max(0.8, required_width)
		item['size']['height'] = thickness
		item['size']['depth'] = required_depth
		item['position']['y'] = max(0.68, tabletop_top - thickness)
		if role in ('left', 'right'):
			item['position']['z'] = (min_z + max_z) * 0.5
		else:
			item['position']['x'] = (min_x + max_x) * 0.5
		item['wallRole'] = role
		item['placement'] = 'attached-to-wall'
		item['supportSurface'] = role
		item['anchor'] = item.get('anchor') or 'center'
		item['mountType'] = 'wall'
		item['shouldTouchGround'] = False
		item['groundReason'] = '挂墙桌板/台面应为贴墙薄支撑面，不作为落地大体块。'
		item['relationReason'] = item.get('relationReason') or '根据挂墙桌板语义与桌面设备分布，收敛为贴墙薄台面。'
		relation_tags = [str(tag or '').strip().lower() for tag in item.get('relationTags') or [] if str(tag or '').strip()]
		relation_tags = [tag for tag in relation_tags if tag != 'floor-supported']
		if 'wall-attached' not in relation_tags:
			relation_tags.append('wall-attached')
		item['relationTags'] = relation_tags
		if wall_parent is not None:
			item['parentId'] = str(wall_parent.get('id') or '')
	return items


def _enrich_desktop_support_relationships(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	if not items:
		return items
	items_by_id = {str(item.get('id') or '').strip(): item for item in items}
	existing_ids = set(items_by_id.keys())
	walls = [item for item in items if _is_wall_like(item)]
	support_candidates = [item for item in items if _support_surface_like(item)]
	additions: List[Dict[str, Any]] = []
	for item in items:
		if not _desktop_electronics_like(item):
			continue
		parent = items_by_id.get(str(item.get('parentId') or '').strip())
		placement = str(item.get('placement') or '').strip().lower()
		support_surface = str(item.get('supportSurface') or '').strip().lower()
		if parent is not None and placement == 'on-top' and support_surface == 'top':
			continue
		top_parent = _find_top_support(item, support_candidates)
		if top_parent is None:
			near_wall = _find_near_wall(item, walls)
			if near_wall is not None and _should_infer_remote_support(item, near_wall):
				inferred = _create_inferred_remote_support(item, near_wall, existing_ids=existing_ids)
				if inferred is not None:
					inferred = _apply_layout_semantics(_normalize_relation_fields(inferred))
					additions.append(inferred)
					existing_ids.add(str(inferred.get('id') or ''))
					items_by_id[str(inferred.get('id') or '')] = inferred
					support_candidates.append(inferred)
					top_parent = inferred
		if top_parent is None and _to_float((_as_dict(item.get('position'))).get('y'), 0.0) > 0.2:
			inferred = _create_inferred_support(item, existing_ids=existing_ids)
			if inferred is not None:
				inferred = _apply_layout_semantics(_normalize_relation_fields(inferred))
				additions.append(inferred)
				existing_ids.add(str(inferred.get('id') or ''))
				items_by_id[str(inferred.get('id') or '')] = inferred
				support_candidates.append(inferred)
				top_parent = inferred
		if top_parent is None:
			continue
		item['parentId'] = str(top_parent.get('id') or '')
		item['placement'] = 'on-top'
		item['supportSurface'] = 'top'
		item['anchor'] = item.get('anchor') or 'center'
		item['position']['y'] = max(_to_float(item['position'].get('y'), 0.0), _top_y(top_parent))
		item['shouldTouchGround'] = False
		item['groundReason'] = item.get('groundReason') or '由桌面/台面承托，不贴地。'
		item['relationReason'] = item.get('relationReason') or '根据桌面/工作台支撑关系自动补全。'
		if not item.get('proximityGroupId'):
			item['proximityGroupId'] = str(top_parent.get('id') or '')
	if additions:
		items.extend(additions)
	return items


def _expand_support_surfaces_for_children(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	if not items:
		return items
	children_by_parent: Dict[str, List[Dict[str, Any]]] = {}
	for item in items:
		parent_id = str(item.get('parentId') or '').strip()
		if not parent_id:
			continue
		if str(item.get('placement') or '').strip().lower() != 'on-top':
			continue
		children_by_parent.setdefault(parent_id, []).append(item)
	for parent in items:
		parent_id = str(parent.get('id') or '').strip()
		children = children_by_parent.get(parent_id) or []
		if not children or not _support_surface_like(parent):
			continue
		min_x = min(_bounds_xz(child)[0] for child in children)
		max_x = max(_bounds_xz(child)[1] for child in children)
		min_z = min(_bounds_xz(child)[2] for child in children)
		max_z = max(_bounds_xz(child)[3] for child in children)
		child_span_x = max_x - min_x
		child_span_z = max_z - min_z
		parent_size = _effective_size(parent)
		margin_x = max(0.18, max((_effective_size(child)['width'] for child in children), default=0.18) * 0.35)
		margin_z = max(0.18, max((_effective_size(child)['depth'] for child in children), default=0.18) * 0.4)
		placement = str(parent.get('placement') or '').strip().lower()
		wall_role = _canonical_wall_role(parent.get('wallRole'))
		is_wall_attached = placement == 'attached-to-wall' and wall_role in ('left', 'right', 'front', 'back')
		if is_wall_attached:
			along_axis, outward_axis = _wall_aligned_span_axes(parent)
			along_span = child_span_z if along_axis == 'z' else child_span_x
			outward_span = child_span_x if outward_axis == 'x' else child_span_z
			along_margin = margin_z if along_axis == 'z' else margin_x
			outward_margin = margin_x if outward_axis == 'x' else margin_z
			required_width = max(parent_size['width'], along_span + along_margin * 2)
			required_depth = max(parent_size['depth'], outward_span + outward_margin * 2)
			# Keep wall-mounted desks/shelves desk-like: width follows the wall, depth only captures outward protrusion.
			required_depth = min(required_depth, max(0.45, min(required_width * 0.28, 1.2)))
		else:
			required_width = max(parent_size['width'], child_span_x + margin_x * 2)
			required_depth = max(parent_size['depth'], child_span_z + margin_z * 2)
		is_central = str(parent.get('placement') or '').strip().lower() != 'attached-to-wall' and not str(parent.get('wallRole') or '').strip()
		if is_central and len(children) >= 3:
			required_width = max(required_width, 1.6)
			required_depth = max(required_depth, 1.0)
		parent['size']['width'] = max(_to_float(parent['size'].get('width'), required_width), required_width)
		parent['size']['depth'] = max(_to_float(parent['size'].get('depth'), required_depth), required_depth)
		if is_central:
			target_center_x = (min_x + max_x) * 0.5
			target_center_z = (min_z + max_z) * 0.5
			parent['position']['x'] = target_center_x
			parent['position']['z'] = target_center_z
		elif str(parent.get('placement') or '').strip().lower() == 'attached-to-wall':
			rotation = _as_dict(parent.get('rotation'))
			yaw = _nearest_cardinal_yaw(_to_float(rotation.get('yaw'), 0.0))
			if yaw in (0.0, 180.0):
				parent['position']['x'] = (min_x + max_x) * 0.5
			else:
				parent['position']['z'] = (min_z + max_z) * 0.5
	return items


def _repair_invalid_ceiling_relationships(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	if not items:
		return items
	items_by_id = {str(item.get('id') or '').strip(): item for item in items}
	walls = [item for item in items if _is_wall_like(item)]
	support_candidates = [
		item for item in items
		if not _is_floor_like(item) and not _is_wall_like(item) and not _is_ceiling_like(item)
		and (_is_large_anchor_like(item) or _wall_supported_surface_like(item))
	]
	for item in items:
		parent_id = str(item.get('parentId') or '').strip()
		parent = items_by_id.get(parent_id)
		placement = str(item.get('placement') or '').strip().lower()
		support_surface = str(item.get('supportSurface') or '').strip().lower()
		mount_type = str(item.get('mountType') or '').strip().lower()
		ceiling_related = bool(parent is not None and _is_ceiling_like(parent)) or placement == 'attached-to-ceiling' or support_surface == 'ceiling' or mount_type == 'ceiling'
		if not ceiling_related or _ceiling_mount_allowed(item):
			continue

		item['parentId'] = ''
		if placement == 'attached-to-ceiling':
			item['placement'] = ''
		if support_surface == 'ceiling':
			item['supportSurface'] = ''
		if mount_type == 'ceiling':
			item['mountType'] = ''

		top_parent = _find_top_support(item, support_candidates)
		wall_parent = _find_wall_parent(item, walls)

		if _desktop_electronics_like(item) and top_parent is not None:
			item['parentId'] = str(top_parent.get('id') or '')
			item['placement'] = 'on-top'
			item['supportSurface'] = 'top'
			item['anchor'] = item.get('anchor') or 'center'
			item['position']['y'] = max(_to_float(item['position'].get('y'), 0.0), _top_y(top_parent))
			item['shouldTouchGround'] = False
			item['groundReason'] = '由桌面/台面承托，不贴地。'
			item['relationReason'] = item.get('relationReason') or '纠正错误的贴顶关系后，改为桌面承托。'
			continue

		if _wall_supported_surface_like(item) and wall_parent is not None:
			item['parentId'] = str(wall_parent.get('id') or '')
			item['placement'] = 'attached-to-wall'
			item['supportSurface'] = str(wall_parent.get('wallRole') or 'wall')
			item['anchor'] = item.get('anchor') or 'center'
			item['shouldTouchGround'] = _infer_should_touch_ground(item)
			item['groundReason'] = '贴墙支撑，不贴顶。' if not item['shouldTouchGround'] else '贴墙且落地。'
			item['relationReason'] = item.get('relationReason') or '纠正错误的贴顶关系后，改为贴墙支撑。'
			continue

		if top_parent is not None:
			item['parentId'] = str(top_parent.get('id') or '')
			item['placement'] = 'on-top'
			item['supportSurface'] = 'top'
			item['anchor'] = item.get('anchor') or 'center'
			item['position']['y'] = max(_to_float(item['position'].get('y'), 0.0), _top_y(top_parent))
			item['shouldTouchGround'] = False
			item['groundReason'] = '由父物体上表面承托，不贴顶。'
			item['relationReason'] = item.get('relationReason') or '纠正错误的贴顶关系后，改为上表面支撑。'
			continue

		if wall_parent is not None:
			item['parentId'] = str(wall_parent.get('id') or '')
			item['placement'] = 'attached-to-wall'
			item['supportSurface'] = str(wall_parent.get('wallRole') or 'wall')
			item['anchor'] = item.get('anchor') or 'center'
			item['shouldTouchGround'] = _infer_should_touch_ground(item)
			item['groundReason'] = '贴墙安装，不贴顶。' if not item['shouldTouchGround'] else '贴墙且落地。'
			item['relationReason'] = item.get('relationReason') or '纠正错误的贴顶关系后，改为贴墙关系。'
			continue

		item['placement'] = 'on-floor'
		item['supportSurface'] = 'floor'
		item['anchor'] = item.get('anchor') or 'center'
		item['position']['y'] = 0.0
		item['shouldTouchGround'] = True
		item['groundReason'] = '纠正错误的贴顶关系后，按落地处理。'
		item['relationReason'] = item.get('relationReason') or '无合理顶部支撑，回退为落地物体。'
	return items


def _harmonize_parent_child_relationship(item: Dict[str, Any], parent: Dict[str, Any]) -> None:
	parent_is_wall = _is_wall_like(parent)
	parent_is_ceiling = _is_ceiling_like(parent)
	placement = str(item.get('placement') or '').strip().lower()
	mount_type = str(item.get('mountType') or '').strip().lower()
	semantic_role = str(item.get('semanticRole') or '').strip().lower()
	support_surface = str(item.get('supportSurface') or '').strip().lower()
	key_element_type = str(item.get('keyElementType') or '').strip().lower()
	tokens = ' '.join([
		str(item.get('category') or '').strip().lower(),
		str(item.get('subCategory') or '').strip().lower(),
		str(item.get('name') or '').strip().lower(),
		semantic_role,
		key_element_type,
	])
	wall_fixture_like = _text_match(tokens, ['wall-art', 'wall light', 'wall-light', 'sconce', 'poster', 'painting', 'mirror', '挂画', '壁灯', '装饰画', '镜子'])
	embedded_like = mount_type == 'embedded-wall' or semantic_role in ('built-in-fixture', 'architectural-opening') or key_element_type in ('window', 'door', 'opening', 'builtin-fixture', 'fixed-installation')
	ceiling_fixture_like = mount_type == 'ceiling' or semantic_role == 'ceiling-fixture' or _text_match(tokens, ['ceiling-light', 'light', 'lamp', '吊灯', '吸顶灯', '灯组'])
	support_top_like = mount_type == 'support-top' or semantic_role == 'support-object' or placement == 'on-top'
	embedded_inside_like = _text_match(tokens, ['柜内', '展示柜内', '书柜内', '内部', 'inside', 'interior']) or (
		_text_match(parent_tokens := ' '.join([
			str(parent.get('name') or '').strip().lower(),
			str(parent.get('subCategory') or '').strip().lower(),
			str(parent.get('mountType') or '').strip().lower(),
		]), ['display-cabinet', 'display cabinet', '展示柜', 'bookshelf', 'bookcase', '书柜'])
		and _text_match(tokens, ['armor', '盔甲', 'display', '展示'])
	)

	if parent_is_wall:
		item['placement'] = 'attached-to-wall'
		item['supportSurface'] = str(parent.get('wallRole') or 'wall') if support_surface in ('', 'floor', 'top', 'ceiling') else support_surface
		item['anchor'] = item.get('anchor') or 'center'
		if wall_fixture_like:
			item['shouldTouchGround'] = False
			if not item.get('groundReason'):
				item['groundReason'] = '贴墙安装，底部离地。'
		elif embedded_like:
			if item.get('shouldTouchGround') is None:
				item['shouldTouchGround'] = _infer_should_touch_ground(item)
		else:
			if item.get('shouldTouchGround') is None:
				item['shouldTouchGround'] = False
		return

	if embedded_inside_like:
		item['placement'] = 'embedded-inside'
		item['supportSurface'] = support_surface if support_surface.startswith('interior-') else 'interior-front'
		item['anchor'] = item.get('anchor') or 'center'
		item['shouldTouchGround'] = False
		if not item.get('groundReason'):
			item['groundReason'] = '位于父物体内部支架/腔体内，不贴地。'
		return

	if parent_is_ceiling or ceiling_fixture_like:
		item['placement'] = 'attached-to-ceiling'
		item['supportSurface'] = 'ceiling'
		item['anchor'] = item.get('anchor') or 'center'
		item['shouldTouchGround'] = False
		if not item.get('groundReason'):
			item['groundReason'] = '吸附在天花下方，不贴地。'
		return

	if support_top_like:
		item['placement'] = 'on-top'
		item['supportSurface'] = 'top'
		item['anchor'] = item.get('anchor') or 'center'
		item['shouldTouchGround'] = False
		if not item.get('groundReason'):
			item['groundReason'] = '由父物体上表面承托，不直接贴地。'


def _assign_relationships(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	if not items:
		return items
	_infer_wall_roles(items)
	items_by_id = {str(item.get('id') or '').strip(): item for item in items}
	for item in items:
		_normalize_relation_fields(item)
		if _is_floor_like(item):
			item['placement'] = 'on-floor'
			item['supportSurface'] = 'floor'
			item['anchor'] = item['anchor'] or 'center'
			item['shouldTouchGround'] = True
			item['groundReason'] = item['groundReason'] or '地面本体贴地。'
			item['relationReason'] = item['relationReason'] or '主地面作为场景世界原点。'
			continue
		if _is_wall_like(item):
			item['placement'] = 'on-floor'
			item['supportSurface'] = 'floor'
			item['anchor'] = item['anchor'] or 'center'
			item['shouldTouchGround'] = True
			item['groundReason'] = item['groundReason'] or '墙体从地面起立。'
			item['relationReason'] = item['relationReason'] or '墙面与地面正交，并从地面起立。'
			continue
		if _is_ceiling_like(item):
			item['placement'] = item['placement'] or 'ceiling-shell'
			item['supportSurface'] = item['supportSurface'] or 'ceiling'
			item['anchor'] = item['anchor'] or 'center'
			item['parentId'] = str(item.get('parentId') or '').strip()
			item['shouldTouchGround'] = False
			item['groundReason'] = item['groundReason'] or '天花参与顶面围合，不贴地。'
			item['relationReason'] = item['relationReason'] or '天花/屋顶参与房间围合。'
			continue

		parent_id = str(item.get('parentId') or '').strip()
		parent = items_by_id.get(parent_id)
		if parent is not None:
			_harmonize_parent_child_relationship(item, parent)
			mount_type = str(item.get('mountType') or '').strip().lower()
			placement = str(item.get('placement') or '').strip().lower()
			wall_attached = placement in ('attached-to-wall', 'embedded-wall') or mount_type == 'embedded-wall'
			ceiling_attached = placement == 'attached-to-ceiling' or mount_type == 'ceiling' or str(item.get('supportSurface') or '').strip().lower() == 'ceiling'
			if not item.get('placement'):
				item['placement'] = 'attached-to-wall' if _is_wall_like(parent) else ('attached-to-ceiling' if _is_ceiling_like(parent) else 'on-top')
			if item['placement'] == 'on-top' and not (_is_ceiling_like(parent) or ceiling_attached):
				item['supportSurface'] = item['supportSurface'] or 'top'
				item['anchor'] = item['anchor'] or 'center'
				item['position']['y'] = max(_to_float(item['position'].get('y'), 0.0), _top_y(parent))
				item['shouldTouchGround'] = False if item.get('shouldTouchGround') is None else bool(item.get('shouldTouchGround'))
				item['groundReason'] = item['groundReason'] or '由父物体上表面承托，不直接贴地。'
			elif wall_attached:
				item['supportSurface'] = item['supportSurface'] or str(parent.get('wallRole') or 'wall')
				item['anchor'] = item['anchor'] or 'center'
				if item.get('shouldTouchGround') is None:
					item['shouldTouchGround'] = _infer_should_touch_ground(item)
				item['groundReason'] = item['groundReason'] or ('贴墙且落地。' if bool(item.get('shouldTouchGround')) else '贴墙安装，底部离地。')
			elif ceiling_attached and _is_ceiling_like(parent):
				item['placement'] = 'attached-to-ceiling'
				item['supportSurface'] = 'ceiling'
				item['anchor'] = item['anchor'] or 'center'
				item['shouldTouchGround'] = False
				item['groundReason'] = item['groundReason'] or '吸附在天花下方，不贴地。'
			else:
				item['anchor'] = item['anchor'] or 'center'
				if item.get('shouldTouchGround') is None:
					item['shouldTouchGround'] = _infer_should_touch_ground(item)
			if not item['proximityGroupId']:
				item['proximityGroupId'] = str(parent.get('id') or '')
			continue

		position_y = _to_float((item.get('position') or {}).get('y'), 0.0)
		if item['placement'] == 'on-floor' or item['supportSurface'] == 'floor' or position_y <= 0.08:
			item['placement'] = item['placement'] or 'on-floor'
			item['supportSurface'] = item['supportSurface'] or 'floor'
			item['anchor'] = item['anchor'] or 'center'
			if item['placement'] == 'on-floor':
				item['position']['y'] = 0.0
			item['shouldTouchGround'] = True if item.get('shouldTouchGround') is None else bool(item.get('shouldTouchGround'))
			item['groundReason'] = item['groundReason'] or '无父级承托，按落地物体处理。'
			item['relationReason'] = item['relationReason'] or '无明确父级支撑物，按直接落地保留。'
			continue

		item['anchor'] = item['anchor'] or 'center'
		if item.get('shouldTouchGround') is None:
			item['shouldTouchGround'] = _infer_should_touch_ground(item)
		item['groundReason'] = item['groundReason'] or ('底部贴地。' if bool(item.get('shouldTouchGround')) else '保留离地高度。')
		item['relationReason'] = item['relationReason'] or '保留模型原始位置与关系判断。'
	return items


def _clamp_int(value: int, min_value: int, max_value: int) -> int:
	return max(min_value, min(max_value, value))


def _append_pixel_rects(items: List[Dict[str, Any]], source_images: Optional[List[Dict[str, Any]]]) -> None:
	if not source_images:
		return
	for item in items:
		source_idx = int(_to_float(item.get('sourceImageIndex'), 1.0) or 1)
		source_idx = max(1, min(len(source_images), source_idx))
		item['sourceImageIndex'] = source_idx
		source_meta = source_images[source_idx - 1] if 0 <= source_idx - 1 < len(source_images) else {}
		img_w = int(_to_float((source_meta or {}).get('width'), 0.0))
		img_h = int(_to_float((source_meta or {}).get('height'), 0.0))
		if img_w <= 0 or img_h <= 0:
			continue
		rect = _as_dict(item.get('imageRect'))
		x0 = _clamp_int(int(round(_to_float(rect.get('x'), 0.0) * img_w)), 0, max(0, img_w - 1))
		y0 = _clamp_int(int(round(_to_float(rect.get('y'), 0.0) * img_h)), 0, max(0, img_h - 1))
		w = _clamp_int(int(round(_to_float(rect.get('width'), 0.0) * img_w)), 1, img_w)
		h = _clamp_int(int(round(_to_float(rect.get('height'), 0.0) * img_h)), 1, img_h)
		if x0 + w > img_w:
			w = max(1, img_w - x0)
		if y0 + h > img_h:
			h = max(1, img_h - y0)
		item['imageRectPixels'] = {
			'x': x0,
			'y': y0,
			'width': w,
			'height': h,
			'imageWidth': img_w,
			'imageHeight': img_h,
		}


def _is_primary_reference_item(item: Dict[str, Any]) -> bool:
	source_idx = max(1, int(_to_float(item.get('sourceImageIndex'), 1.0) or 1))
	if source_idx == 1:
		return True
	raw_observed = item.get('observedImageIndices')
	if not isinstance(raw_observed, list):
		return False
	for raw_idx in raw_observed:
		if int(_to_float(raw_idx, 0.0) or 0) == 1:
			return True
	return False


def _derive_room_shell_candidate(structure_items: List[Dict[str, Any]], content_items: List[Dict[str, Any]]) -> Dict[str, Any]:
	walls = [item for item in structure_items if _is_wall_like(item)]
	floors = [item for item in structure_items if _is_floor_like(item)]
	ceilings = [item for item in structure_items if _is_ceiling_like(item)]
	min_x = max_x = min_z = max_z = None
	detected_walls: List[str] = []
	wall_thickness = 0.15
	wall_top = 0.0
	for wall in walls:
		role = _canonical_wall_role(wall.get('wallRole')) or _resolve_wall_role_from_geometry(wall)
		detected_walls.append(role)
		size = _effective_size(wall)
		wall_thickness = min(wall_thickness, size['depth']) if detected_walls[:-1] else size['depth']
		wall_top = max(wall_top, _top_y(wall))
		wall_min_x, wall_max_x, wall_min_z, wall_max_z = _bounds_xz(wall)
		if role == 'left':
			min_x = wall_max_x if min_x is None else min(min_x, wall_max_x)
		elif role == 'right':
			max_x = wall_min_x if max_x is None else max(max_x, wall_min_x)
		elif role == 'front':
			min_z = wall_max_z if min_z is None else min(min_z, wall_max_z)
		elif role == 'back':
			max_z = wall_min_z if max_z is None else max(max_z, wall_min_z)
	occ_min_x = occ_max_x = occ_min_z = occ_max_z = None
	occ_top = 0.0
	for item in content_items:
		item_min_x, item_max_x, item_min_z, item_max_z = _bounds_xz(item)
		occ_min_x = item_min_x if occ_min_x is None else min(occ_min_x, item_min_x)
		occ_max_x = item_max_x if occ_max_x is None else max(occ_max_x, item_max_x)
		occ_min_z = item_min_z if occ_min_z is None else min(occ_min_z, item_min_z)
		occ_max_z = item_max_z if occ_max_z is None else max(occ_max_z, item_max_z)
		occ_top = max(occ_top, _top_y(item))
	span_x = max(2.4, (occ_max_x - occ_min_x) if occ_min_x is not None and occ_max_x is not None else 4.0)
	span_z = max(2.4, (occ_max_z - occ_min_z) if occ_min_z is not None and occ_max_z is not None else 4.0)
	pad_x = max(0.8, span_x * 0.1)
	pad_z = max(0.8, span_z * 0.1)
	if min_x is None:
		min_x = (occ_min_x if occ_min_x is not None else -2.0) - pad_x
	if max_x is None:
		max_x = (occ_max_x if occ_max_x is not None else 2.0) + pad_x
	if min_z is None:
		min_z = (occ_min_z if occ_min_z is not None else -2.0) - pad_z
	if max_z is None:
		max_z = (occ_max_z if occ_max_z is not None else 2.0) + pad_z
	floor_height = max((_effective_size(item)['height'] for item in floors), default=0.05)
	ceiling_height = max((_effective_size(item)['height'] for item in ceilings), default=0.05)
	ceiling_top = max((_top_y(item) for item in ceilings), default=0.0)
	if wall_top > 0.0 or ceiling_top > 0.0:
		height = max(2.8, wall_top, ceiling_top)
	else:
		height = max(2.8, occ_top + 0.6)
	return {
		'centerX': (min_x + max_x) * 0.5,
		'centerZ': (min_z + max_z) * 0.5,
		'width': max(1.5, max_x - min_x),
		'depth': max(1.5, max_z - min_z),
		'height': height,
		'wallThickness': max(0.05, wall_thickness),
		'hasFloor': bool(floors) or bool(walls),
		'hasCeiling': bool(ceilings) or bool(walls),
		'detectedWalls': [role for role in ['left', 'right', 'front', 'back'] if role in detected_walls],
		'confidence': 0.85 if walls else 0.45,
		'floorHeight': floor_height,
		'ceilingHeight': ceiling_height,
	}


def _merge_shell_candidates(base_shell: Dict[str, Any], supplement_shell: Dict[str, Any]) -> Dict[str, Any]:
	if not base_shell:
		return dict(supplement_shell)
	if not supplement_shell:
		return dict(base_shell)
	base_width = max(1.5, _to_float(base_shell.get('width'), 4.0))
	base_depth = max(1.5, _to_float(base_shell.get('depth'), 4.0))
	full_width = max(base_width, _to_float(supplement_shell.get('width'), base_width))
	full_depth = max(base_depth, _to_float(supplement_shell.get('depth'), base_depth))
	width = min(full_width, max(base_width, base_width * 1.4))
	depth = min(full_depth, max(base_depth, base_depth * 1.4))
	base_center_x = _to_float(base_shell.get('centerX'), 0.0)
	base_center_z = _to_float(base_shell.get('centerZ'), 0.0)
	full_center_x = _to_float(supplement_shell.get('centerX'), base_center_x)
	full_center_z = _to_float(supplement_shell.get('centerZ'), base_center_z)
	shift_x = max(-base_width * 0.12, min(base_width * 0.12, full_center_x - base_center_x))
	shift_z = max(-base_depth * 0.12, min(base_depth * 0.12, full_center_z - base_center_z))
	merged = dict(base_shell)
	merged['centerX'] = base_center_x + shift_x
	merged['centerZ'] = base_center_z + shift_z
	merged['width'] = width
	merged['depth'] = depth
	merged['height'] = max(_to_float(base_shell.get('height'), 2.8), _to_float(supplement_shell.get('height'), 2.8))
	merged['wallThickness'] = max(0.05, _to_float(base_shell.get('wallThickness'), _to_float(supplement_shell.get('wallThickness'), 0.15)))
	merged['floorHeight'] = max(0.05, _to_float(base_shell.get('floorHeight'), _to_float(supplement_shell.get('floorHeight'), 0.05)))
	merged['ceilingHeight'] = max(0.05, _to_float(base_shell.get('ceilingHeight'), _to_float(supplement_shell.get('ceilingHeight'), 0.05)))
	merged['hasFloor'] = bool(base_shell.get('hasFloor')) or bool(supplement_shell.get('hasFloor'))
	merged['hasCeiling'] = bool(base_shell.get('hasCeiling')) or bool(supplement_shell.get('hasCeiling'))
	merged['detectedWalls'] = [
		role
		for role in ['left', 'right', 'front', 'back']
		if role in (base_shell.get('detectedWalls') or []) or role in (supplement_shell.get('detectedWalls') or [])
	]
	merged['confidence'] = max(_to_float(base_shell.get('confidence'), 0.45), _to_float(supplement_shell.get('confidence'), 0.45))
	return merged


def _derive_room_shell(items: List[Dict[str, Any]]) -> Dict[str, Any]:
	structure_items = [item for item in items if _semantic_structure_kind(item) in ('floor', 'wall', 'ceiling')]
	content_items = [item for item in items if _semantic_structure_kind(item) == '']
	return _derive_room_shell_candidate(structure_items, content_items)


def _merge_room_shell_with_primary_scale(raw_shell: Dict[str, Any], derived_shell: Dict[str, Any]) -> Dict[str, Any]:
	merged = dict(raw_shell)
	merged['centerX'] = _to_float(derived_shell.get('centerX'), 0.0)
	merged['centerZ'] = _to_float(derived_shell.get('centerZ'), 0.0)
	merged['width'] = max(1.5, _to_float(derived_shell.get('width'), 4.0))
	merged['depth'] = max(1.5, _to_float(derived_shell.get('depth'), 4.0))
	merged['height'] = max(2.4, _to_float(derived_shell.get('height'), 2.8))
	merged['wallThickness'] = max(0.05, _to_float(derived_shell.get('wallThickness'), 0.15))
	merged['floorHeight'] = max(0.05, _to_float(derived_shell.get('floorHeight'), 0.05))
	merged['ceilingHeight'] = max(0.05, _to_float(derived_shell.get('ceilingHeight'), 0.05))
	merged['hasFloor'] = bool(raw_shell.get('hasFloor')) if 'hasFloor' in raw_shell else bool(derived_shell.get('hasFloor'))
	merged['hasCeiling'] = bool(raw_shell.get('hasCeiling')) if 'hasCeiling' in raw_shell else bool(derived_shell.get('hasCeiling'))
	merged['detectedWalls'] = raw_shell.get('detectedWalls') if isinstance(raw_shell.get('detectedWalls'), list) and raw_shell.get('detectedWalls') else derived_shell.get('detectedWalls')
	merged['confidence'] = _to_float(raw_shell.get('confidence'), _to_float(derived_shell.get('confidence'), 0.45))
	return merged


def _resolve_wall_role_from_geometry(item: Dict[str, Any]) -> str:
	position = _as_dict(item.get('position'))
	rotation = _as_dict(item.get('rotation'))
	yaw = _nearest_cardinal_yaw(_to_float(rotation.get('yaw'), 0.0))
	if yaw in (0.0, 180.0):
		return 'front' if _to_float(position.get('z'), 0.0) <= 0.0 else 'back'
	return 'left' if _to_float(position.get('x'), 0.0) <= 0.0 else 'right'


def _infer_open_wall_role_from_camera_view(view: Any) -> str:
	first = ''
	if isinstance(view, list) and view:
		first = str(view[0] or '').strip().lower()
	else:
		first = str(view or '').strip().lower()
	if not first:
		return ''
	if any(token in first for token in ['front', '前向', '正前', '正视', '朝前']):
		return 'front'
	if any(token in first for token in ['back', 'rear', '后向', '朝后']):
		return 'back'
	if any(token in first for token in ['left', '左向', '朝左']):
		return 'left'
	if any(token in first for token in ['right', '右向', '朝右']):
		return 'right'
	return ''


def _postprocess_scene_result(parsed: Dict[str, Any], *, source_images: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
	raw_objects = parsed.get('objects')
	objects: List[Any] = raw_objects if isinstance(raw_objects, list) else []
	normalized: List[Dict[str, Any]] = []
	groups: List[Dict[str, Any]] = []
	for index, raw in enumerate(objects):
		if not isinstance(raw, dict):
			continue
		item = dict(raw)
		item['id'] = str(item.get('id') or f'obj-{index + 1:03d}')
		item['sourceImageIndex'] = max(1, int(_to_float(item.get('sourceImageIndex'), 1.0) or 1))
		if not isinstance(item.get('observedImageIndices'), list):
			item['observedImageIndices'] = [item['sourceImageIndex']]
		item['name'] = str(item.get('name') or item.get('category') or f'object_{index + 1}')
		item['category'] = str(item.get('category') or 'object')
		item['subCategory'] = str(item.get('subCategory') or '')
		item['material'] = str(item.get('material') or '')
		item['surfaceType'] = str(item.get('surfaceType') or '')
		raw_position = item.get('position')
		position: Dict[str, Any] = raw_position if isinstance(raw_position, dict) else {}
		raw_size = item.get('size')
		size: Dict[str, Any] = raw_size if isinstance(raw_size, dict) else {}
		item['position'] = {
			'x': _to_float(position.get('x'), float(index) * 0.9),
			'y': _to_float(position.get('y'), 0.0),
			'z': _to_float(position.get('z'), 0.0),
		}
		item['size'] = {
			'width': max(0.05, _to_float(size.get('width'), 1.0)),
			'height': max(0.05, _to_float(size.get('height'), 1.0)),
			'depth': max(0.05, _to_float(size.get('depth'), 1.0)),
		}
		item['rotation'] = _normalize_rotation(item.get('rotation'))
		item['scale'] = _normalize_scale(item.get('scale'))
		raw_image_rect = item.get('imageRect')
		image_rect: Dict[str, Any] = raw_image_rect if isinstance(raw_image_rect, dict) else {}
		item['imageRect'] = {
			'x': min(1.0, max(0.0, _to_float(image_rect.get('x'), 0.0))),
			'y': min(1.0, max(0.0, _to_float(image_rect.get('y'), 0.0))),
			'width': min(1.0, max(0.01, _to_float(image_rect.get('width'), 0.2))),
			'height': min(1.0, max(0.01, _to_float(image_rect.get('height'), 0.2))),
		}
		item['description'] = str(item.get('description') or '')
		name_key = _normalize_name_key(item)
		signature = _size_signature(item)
		matched = None
		for group in groups:
			if group['nameKey'] == name_key and _size_similar(group['signature'], signature):
				matched = group
				break
		if matched is None:
			matched = {
				'id': f'{name_key or "object"}-{len(groups) + 1}',
				'label': item['name'],
				'nameKey': name_key,
				'signature': signature,
			}
			groups.append(matched)
		item['sameTypeGroupId'] = str(item.get('sameTypeGroupId') or matched['id'])
		item['sameTypeGroupLabel'] = str(item.get('sameTypeGroupLabel') or matched['label'])
		item['sameTypeReason'] = str(
			item.get('sameTypeReason')
			or '名称/类别一致，尺寸与形状接近；颜色差异不影响同类型判断。'
		)
		normalized.append(item)

	normalized = _apply_interior_geometry_constraints(normalized)
	normalized = _assign_relationships(normalized)
	normalized = _normalize_wall_supported_surface_geometry(normalized)
	normalized = _canonicalize_wall_aligned_geometry(normalized)
	normalized = _snap_wall_attached_items_to_parent_surface(normalized)
	normalized = _repair_invalid_ceiling_relationships(normalized)
	normalized = _enrich_desktop_support_relationships(normalized)
	normalized = _expand_support_surfaces_for_children(normalized)
	normalized = [_apply_layout_semantics(item) for item in normalized]
	_append_pixel_rects(normalized, source_images)

	parsed['sceneType'] = str(parsed.get('sceneType') or 'interior-design')
	raw_camera = _as_dict(parsed.get('camera'))
	raw_view = raw_camera.get('view')
	if isinstance(raw_view, list):
		camera_view = [str(item or '').strip() for item in raw_view if str(item or '').strip()]
	else:
		view_text = str(raw_view or '').strip()
		camera_view = [view_text] if view_text else []
	open_wall_role = _canonical_wall_role(raw_camera.get('openWallRole')) or _infer_open_wall_role_from_camera_view(camera_view)
	parsed['camera'] = {
		**raw_camera,
		'view': camera_view,
		'openWallRole': open_wall_role,
		'fovEstimate': _to_float(raw_camera.get('fovEstimate'), 60.0),
	}
	derived_room_shell = _derive_room_shell(normalized)
	parsed['roomShell'] = _merge_room_shell_with_primary_scale(_as_dict(parsed.get('roomShell')), derived_room_shell)
	parsed['analysisPriority'] = parsed.get('analysisPriority') if isinstance(parsed.get('analysisPriority'), list) else [
		'wall', 'desktop', 'wall-decoration', 'floor-items', 'desktop-items'
	]
	parsed['keyElements'] = _build_key_elements_summary(normalized)
	parsed['relationshipSummary'] = {
		'objectCount': len(normalized),
		'parentedCount': sum(1 for item in normalized if str(item.get('parentId') or '').strip()),
		'inferredSupportCount': sum(1 for item in normalized if bool(item.get('inferred'))),
		'wallAttachedCount': sum(1 for item in normalized if str(item.get('placement') or '') == 'attached-to-wall'),
	}
	parsed['objects'] = normalized
	return parsed


def _normalize_scene_understand_inputs(image_inputs: Any, image_url: str, image_data_url: str) -> List[Dict[str, Any]]:
	normalized: List[Dict[str, Any]] = []
	if isinstance(image_inputs, list):
		for index, raw in enumerate(image_inputs):
			if not isinstance(raw, dict):
				continue
			image_ref = str(raw.get('imageDataUrl') or raw.get('imageUrl') or '').strip()
			if not image_ref:
				continue
			normalized.append(
				{
					'index': index + 1,
					'imageRef': _normalize_image_ref_for_ark(image_ref),
					'width': int(_to_float(raw.get('width'), 0.0)) or None,
					'height': int(_to_float(raw.get('height'), 0.0)) or None,
				}
			)
	if normalized:
		return normalized[:4]
	image_ref = str(image_data_url or image_url or '').strip()
	if not image_ref:
		return []
	return [{'index': 1, 'imageRef': _normalize_image_ref_for_ark(image_ref), 'width': None, 'height': None}]


def _compact_preview(text: str, limit: int = 320) -> str:
	preview = re.sub(r'\s+', ' ', str(text or '')).strip()
	if len(preview) <= limit:
		return preview
	return preview[: limit - 3] + '...'


def _strip_code_fence(text: str) -> str:
	raw = str(text or '').strip()
	if raw.startswith('```') and raw.endswith('```'):
		lines = raw.splitlines()
		if len(lines) >= 3:
			return '\n'.join(lines[1:-1]).strip()
	return raw


def _find_balanced_json_object(text: str) -> Optional[str]:
	raw = str(text or '')
	start = raw.find('{')
	if start < 0:
		return None
	depth = 0
	in_string = False
	escaped = False
	for index in range(start, len(raw)):
		ch = raw[index]
		if in_string:
			if escaped:
				escaped = False
			elif ch == '\\':
				escaped = True
			elif ch == '"':
				in_string = False
			continue
		if ch == '"':
			in_string = True
			continue
		if ch == '{':
			depth += 1
		elif ch == '}':
			depth -= 1
			if depth == 0:
				return raw[start : index + 1]
	return None


def _json_parse_failure_detail(text: str, exc: Exception) -> str:
	trimmed = str(text or '').rstrip()
	preview = _compact_preview(trimmed)
	if trimmed.count('{') > trimmed.count('}') or not trimmed.endswith('}'):
		return f'模型返回的 JSON 可能被截断或未闭合：{exc}; 预览: {preview}'
	return f'模型返回的 JSON 语法不合法：{exc}; 预览: {preview}'


def _extract_first_json_object(raw: str) -> Dict[str, Any]:
	text = _strip_code_fence(raw)
	if not text:
		raise ModelResponseParseError('模型未返回任何内容')
	try:
		parsed = json.loads(text)
		if isinstance(parsed, dict):
			return parsed
		if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
			return parsed[0]
	except json.JSONDecodeError as exc:
		balanced = _find_balanced_json_object(text)
		if balanced:
			try:
				parsed = json.loads(balanced)
				if isinstance(parsed, dict):
					return parsed
			except json.JSONDecodeError as inner_exc:
				raise ModelResponseParseError(_json_parse_failure_detail(balanced, inner_exc), raw_preview=_compact_preview(balanced)) from inner_exc
		raise ModelResponseParseError(_json_parse_failure_detail(text, exc), raw_preview=preview if (preview := _compact_preview(text)) else '') from exc
	if '{' in text:
		balanced = _find_balanced_json_object(text)
		if balanced:
			try:
				parsed = json.loads(balanced)
				if isinstance(parsed, dict):
					return parsed
			except json.JSONDecodeError as exc:
				raise ModelResponseParseError(_json_parse_failure_detail(balanced, exc), raw_preview=_compact_preview(balanced)) from exc
	raise ModelResponseParseError('模型返回内容中未找到 JSON 对象', raw_preview=_compact_preview(text))


def _repair_scene_json_via_model(*, model: str, api_key: str, base_url: str, raw_text: str) -> Optional[str]:
	broken = str(raw_text or '').strip()
	if not broken:
		return None
	repair_messages: List[Dict[str, Any]] = [
		{
			'role': 'system',
			'content': (
				'你是 JSON 修复器。'
				'输入是一段接近合法 JSON 的文本。'
				'你的任务是在尽量不改变语义的前提下，将其修复为一个可被 json.loads 解析的单个 JSON 对象。'
				'不要输出解释，不要输出 markdown，不要输出代码块，只输出修复后的 JSON 对象。'
			),
		},
		{
			'role': 'user',
			'content': (
				'请修复下面这段 JSON，使其成为严格合法的单个 JSON 对象。'
				'如果文本疑似被截断，请基于已有字段做最小闭合，不要凭空扩写大量新内容。\n\n'
				f'{broken}'
			),
		},
	]
	attempt_response_formats: List[Optional[Dict[str, Any]]] = [{'type': 'json_object'}, None]
	for response_format in attempt_response_formats:
		try:
			return _openai_chat(
				base_url=base_url.rstrip('/'),
				api_key=api_key,
				model=model,
				messages=repair_messages,
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


def _build_scene_understand_messages(prompt_text: str, image_inputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	content_items: List[Dict[str, Any]] = [
		{
			'type': 'text',
			'text': '以下图片是同一室内空间的多视角参考。请先综合全部参考图建立统一房屋结构与 roomShell，再补全全部 objects、不可移动结构、支撑关系和附着关系；其中 camera.openWallRole 请优先参考第一张图判断。若子物体位于父物体内部，请输出 embedded-inside 与明确的嵌入方向，不要误写成 on-top。场景分解节点会直接使用 sourceImageIndex + imageRect 自动截图，所以每个非壳体对象都必须选择唯一一张最适合截图的参考图作为 sourceImageIndex，并在这唯一一张图上给出紧致、准确、非整图默认值的 imageRect。'
		}
	]
	for item in image_inputs[:4]:
		content_items.append({'type': 'image_url', 'image_url': {'url': str(item.get('imageRef') or ''), 'detail': 'high'}})
	messages: List[Dict[str, Any]] = [
		{'role': 'system', 'content': build_scene_understand_system_prompt()},
		{
			'role': 'user',
			'content': [
				*content_items,
				{'type': 'text', 'text': build_scene_understand_user_prompt(prompt_text, image_count=len(image_inputs))},
			],
		},
	]
	return messages


def _split_scene_understand_messages(messages: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
	if not messages:
		return [], []
	first = messages[0]
	if str(first.get('role') or '').strip().lower() == 'system':
		return [first], messages[1:]
	return [], messages


def _ark_json_request(
	*,
	base_url: str,
	api_key: str,
	path: str,
	body: Dict[str, Any],
	accept: str = 'application/json',
	timeout_s: Optional[float] = 60,
) -> Dict[str, Any]:
	url = f"{base_url.rstrip('/')}{path}"
	req_body = json.dumps(body, ensure_ascii=False).encode('utf-8')
	req = urllib.request.Request(
		url,
		data=req_body,
		method='POST',
		headers={
			'Content-Type': 'application/json',
			'Accept': accept,
			'Authorization': f'Bearer {api_key}',
		},
	)
	open_kwargs: Dict[str, Any] = {}
	if timeout_s is not None and float(timeout_s) > 0:
		open_kwargs['timeout'] = float(timeout_s)
	with urllib.request.urlopen(req, **open_kwargs) as resp:
		data = resp.read().decode('utf-8', errors='ignore')
	obj = json.loads(data)
	return obj if isinstance(obj, dict) else {}


def _ark_context_create(
	*,
	base_url: str,
	api_key: str,
	model: str,
	seed_messages: List[Dict[str, Any]],
	ttl_s: int = SCENE_UNDERSTAND_CONTEXT_TTL_SECONDS,
) -> str:
	obj = _ark_json_request(
		base_url=base_url,
		api_key=api_key,
		path='/context/create',
		body={
			'model': model,
			'mode': 'session',
			'ttl': int(max(3600, ttl_s)),
			'messages': seed_messages,
			'truncation_strategy': {'type': 'rolling_tokens', 'rolling_tokens': False},
		},
		accept='application/json',
		timeout_s=None,
	)
	context_id = str(obj.get('id') or '').strip()
	if not context_id:
		raise RuntimeError('ark context create did not return context id')
	return context_id


def _ark_context_chat(
	*,
	base_url: str,
	api_key: str,
	context_id: str,
	model: str,
	messages: List[Dict[str, Any]],
	response_format: Optional[Dict[str, Any]] = None,
	on_usage=None,
	timeout_s: Optional[float] = 60,
) -> str:
	body: Dict[str, Any] = {
		'context_id': context_id,
		'model': model,
		'messages': messages,
		'stream': False,
	}
	if response_format is not None:
		body['response_format'] = response_format
	obj = _ark_json_request(
		base_url=base_url,
		api_key=api_key,
		path='/context/chat/completions',
		body=body,
		accept='application/json',
		timeout_s=timeout_s,
	)
	if callable(on_usage):
		try:
			on_usage(obj.get('usage'))
		except Exception:
			pass
	choices = obj.get('choices') or []
	if not choices:
		return ''
	msg = choices[0].get('message') or {}
	content = msg.get('content')
	return content if isinstance(content, str) else ''


def _ark_context_stream_chat(
	*,
	base_url: str,
	api_key: str,
	context_id: str,
	model: str,
	messages: List[Dict[str, Any]],
	response_format: Optional[Dict[str, Any]] = None,
	on_usage=None,
	timeout_s: Optional[float] = 60,
) -> Iterable[str]:
	url = f"{base_url.rstrip('/')}/context/chat/completions"
	body: Dict[str, Any] = {
		'context_id': context_id,
		'model': model,
		'messages': messages,
		'stream': True,
		'stream_options': {'include_usage': True},
	}
	if response_format is not None:
		body['response_format'] = response_format
	req_body = json.dumps(body, ensure_ascii=False).encode('utf-8')
	req = urllib.request.Request(
		url,
		data=req_body,
		method='POST',
		headers={
			'Content-Type': 'application/json',
			'Accept': 'text/event-stream',
			'Authorization': f'Bearer {api_key}',
		},
	)
	open_kwargs: Dict[str, Any] = {}
	if timeout_s is not None and float(timeout_s) > 0:
		open_kwargs['timeout'] = float(timeout_s)
	with urllib.request.urlopen(req, **open_kwargs) as resp:
		for raw in resp:
			try:
				line = raw.decode('utf-8', errors='ignore').strip()
			except Exception:
				continue
			if not line or not line.startswith('data:'):
				continue
			data = line[len('data:'):].strip()
			if data == '[DONE]':
				break
			try:
				obj = json.loads(data)
			except json.JSONDecodeError:
				continue
			if callable(on_usage) and isinstance(obj.get('usage'), dict):
				try:
					on_usage(obj.get('usage'))
				except Exception:
					pass
			choices = obj.get('choices') or []
			if not choices:
				continue
			delta = choices[0].get('delta') or {}
			content = delta.get('content')
			if isinstance(content, str) and content:
				yield content


def _stream_scene_understand_initial_response(
	*,
	use_context: bool,
	base_url: str,
	api_key: str,
	model: str,
	context_id: Optional[str],
	messages: List[Dict[str, Any]],
	response_format: Optional[Dict[str, Any]] = None,
	on_usage=None,
	timeout_s: Optional[float] = 60,
) -> Iterable[str]:
	if use_context and context_id:
		return _ark_context_stream_chat(
			base_url=base_url,
			api_key=api_key,
			context_id=context_id,
			model=model,
			messages=messages,
			response_format=None,
			on_usage=on_usage,
			timeout_s=timeout_s,
		)
	return _openai_stream_chat(
		base_url=base_url,
		api_key=api_key,
		model=model,
		messages=messages,
		response_format=response_format,
		timeout_s=timeout_s,
	)


def _stream_scene_json_rewrite(
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
			messages=[{'role': 'user', 'content': _scene_context_rewrite_instruction(raw_text, reason=reason, attempt=attempt)}],
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
			{'role': 'user', 'content': _scene_rewrite_instruction(raw_text, reason=reason, attempt=attempt)},
		],
		response_format=response_format,
		timeout_s=timeout_s,
	)


def _scene_context_tail_preview(raw_text: str, limit: int = 800) -> str:
	raw = _strip_code_fence(str(raw_text or '')).strip()
	if len(raw) <= limit:
		return raw
	return raw[-limit:]


def _scene_continuation_instruction(raw_text: str, *, attempt: int) -> str:
	tail_preview = _scene_context_tail_preview(raw_text)
	return (
		f'你上一条 assistant 消息输出的 JSON 在中途结束了。当前为第 {attempt} 次续写。'
		'请基于当前会话中已经完成的同一次多视角分析，从你上一条 assistant 消息的最后一个字符继续补全剩余 JSON。'
		'不要重头再写，不要重复任何已经输出过的前缀，不要输出 markdown，不要输出解释。'
		'以下只是已输出尾部预览，帮助你对齐，严禁重复原样输出这段预览：\n\n'
		f'{tail_preview}'
	)


def _scene_context_rewrite_instruction(raw_text: str, *, reason: str, attempt: int) -> str:
	reason_text = '上一轮输出过长，存在截断风险。' if reason == 'too_long' else '上一轮输出 JSON 不完整或不可解析。'
	tail_preview = _scene_context_tail_preview(raw_text)
	return (
		f'{reason_text}'
		f'当前为第 {attempt} 次紧凑重写。'
		'请基于当前会话中已经完成的同一次多视角分析与刚才那条未完成回复，重新输出一个完整、严格合法、单个 JSON 对象。'
		'不要丢失已识别对象、keyElements、roomShell、camera 与关系字段。'
		'请压缩 description、relationReason、sameTypeReason、groundReason 的字数。'
		'不要输出 markdown 或解释。'
		'以下是上一轮回复的尾部预览，仅用于帮助你识别当前上下文，不要求原样复述：\n\n'
		f'{tail_preview}'
	)


def _scene_json_needs_rewrite(text: str, parse_error: Optional[Exception] = None) -> bool:
	raw = str(text or '').strip()
	if not raw:
		return False
	if parse_error is not None:
		return True
	return len(raw) >= SCENE_JSON_REWRITE_TRIGGER_CHARS


def _scene_json_should_continue(text: str, parse_error: Optional[Exception] = None) -> bool:
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
	return len(raw) >= SCENE_JSON_REWRITE_TRIGGER_CHARS


def _scene_continuation_prefill(raw_text: str) -> str:
	text = _strip_code_fence(str(raw_text or ''))
	start = text.find('{')
	if start >= 0:
		return text[start:]
	return text


def _merge_scene_json_progress(existing_text: str, new_text: str) -> str:
	base = str(existing_text or '')
	incoming = _strip_code_fence(str(new_text or ''))
	if not incoming:
		return base
	max_overlap = min(len(base), len(incoming), SCENE_JSON_CONTINUATION_OVERLAP_CHARS)
	for size in range(max_overlap, 0, -1):
		if base.endswith(incoming[:size]):
			return base + incoming[size:]
	return base + incoming


def _continue_scene_json_via_prefill(
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
				messages=[{'role': 'user', 'content': _scene_continuation_instruction(raw_text, attempt=attempt)}],
				response_format=None,
				timeout_s=None,
			)
		except Exception:
			return None
	prefill = _scene_continuation_prefill(raw_text)
	if not prefill.strip():
		return None
	continuation_messages = [
		*messages,
		{'role': 'assistant', 'content': prefill},
	]
	try:
		return _openai_chat(
			base_url=base_url.rstrip('/'),
			api_key=api_key,
			model=model,
			messages=continuation_messages,
			response_format=None,
			timeout_s=None,
		)
	except Exception:
		return None


def _stream_scene_json_continuation(
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
				messages=[{'role': 'user', 'content': _scene_continuation_instruction(base_content, attempt=attempt)}],
				response_format=None,
				timeout_s=None,
			):
				if not delta:
					continue
				continuation_accum += delta
				next_merged = _merge_scene_json_progress(base_content, continuation_accum)
				if len(next_merged) > len(merged):
					on_delta(next_merged[len(merged):])
				merged = next_merged
		except Exception:
			return None
		return merged if str(merged or '').strip() else None
	prefill = _scene_continuation_prefill(base_content)
	if not prefill.strip():
		return None
	continuation_messages = [
		*messages,
		{'role': 'assistant', 'content': prefill},
	]
	continuation_accum = ''
	merged = str(base_content or '')
	for delta in _openai_stream_chat(
		base_url=base_url.rstrip('/'),
		api_key=api_key,
		model=model,
		messages=continuation_messages,
		response_format=None,
		timeout_s=None,
	):
		if not delta:
			continue
		continuation_accum += delta
		next_merged = _merge_scene_json_progress(base_content, continuation_accum)
		if len(next_merged) > len(merged):
			on_delta(next_merged[len(merged):])
		merged = next_merged
	return merged if str(merged or '').strip() else None


def _scene_rewrite_instruction(raw_text: str, *, reason: str, attempt: int) -> str:
	broken = str(raw_text or '').strip()
	reason_text = '上一轮输出过长，存在被截断风险。' if reason == 'too_long' else '上一轮输出 JSON 不完整或不可解析。'
	return (
		f'{reason_text}'
		'请基于你刚才同一轮多视角分析结果继续完成，不要重新解释，不要输出 markdown。'
		'请直接输出一个完整、严格合法、单个 JSON 对象。'
		'不要丢失已识别对象、keyElements、roomShell、camera 与关系字段。'
		'请显著压缩 description、relationReason、sameTypeReason、groundReason 的字数，必要时改成极短短语。'
		'若上一轮内容已包含大部分对象，请保留对象数量与字段完整性，优先做补全和闭合。'
		f'当前为第 {attempt} 次紧凑重写。以下是上一轮原始输出：\n\n{broken}'
	)


def _rewrite_scene_json_via_same_context(
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
		attempt_response_formats: List[Optional[Dict[str, Any]]] = [{'type': 'json_object'}, None]
		for response_format in attempt_response_formats:
			try:
				return _ark_context_chat(
					base_url=base_url.rstrip('/'),
					api_key=api_key,
					context_id=context_id,
					model=model,
					messages=[{'role': 'user', 'content': _scene_context_rewrite_instruction(raw_text, reason=reason, attempt=attempt)}],
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
	rewrite_messages = [
		*messages,
		{'role': 'assistant', 'content': str(raw_text or '')},
		{'role': 'user', 'content': _scene_rewrite_instruction(raw_text, reason=reason, attempt=attempt)},
	]
	attempt_response_formats: List[Optional[Dict[str, Any]]] = [{'type': 'json_object'}, None]
	for response_format in attempt_response_formats:
		try:
			return _openai_chat(
				base_url=base_url.rstrip('/'),
				api_key=api_key,
				model=model,
				messages=rewrite_messages,
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


def _finalize_scene_understand_candidate(
	*,
	model: str,
	api_key: str,
	base_url: str,
	messages: List[Dict[str, Any]],
	candidate_content: str,
	source_images: List[Dict[str, Any]],
	context_id: Optional[str] = None,
) -> Tuple[Dict[str, Any], str, bool, int]:
	current_content = str(candidate_content or '')
	continuation_attempts = 0
	parse_error: Optional[Exception] = None
	for continuation_attempt in range(1, SCENE_JSON_CONTINUATION_MAX_ATTEMPTS + 1):
		try:
			parsed = _parse_scene_understand_content(
				content=current_content,
				model=model,
				api_key=api_key,
				base_url=base_url,
				source_images=source_images,
			)
			return parsed, current_content, continuation_attempts > 0, continuation_attempts
		except ModelResponseParseError as exc:
			parse_error = exc
			if continuation_attempt >= SCENE_JSON_CONTINUATION_MAX_ATTEMPTS:
				break
			if not _scene_json_should_continue(current_content, exc):
				break
			continued = _continue_scene_json_via_prefill(
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
			current_content = _merge_scene_json_progress(current_content, str(continued or ''))
			continuation_attempts = continuation_attempt
	if _scene_json_needs_rewrite(current_content, parse_error):
		for rewrite_attempt in range(1, SCENE_JSON_REWRITE_MAX_ATTEMPTS + 1):
			rewritten = _rewrite_scene_json_via_same_context(
				model=model,
				api_key=api_key,
				base_url=base_url,
				messages=messages,
				raw_text=current_content,
				reason='too_long' if len(str(current_content or '')) >= SCENE_JSON_REWRITE_TRIGGER_CHARS else 'parse_error',
				attempt=rewrite_attempt,
				context_id=context_id,
			)
			if not str(rewritten or '').strip():
				continue
			current_content = str(rewritten or '')
			parsed = _parse_scene_understand_content(
				content=current_content,
				model=model,
				api_key=api_key,
				base_url=base_url,
				source_images=source_images,
			)
			return parsed, current_content, True, continuation_attempts
	if parse_error is not None:
		raise parse_error
	raise ModelResponseParseError('模型未返回可解析 JSON')


def _parse_scene_understand_content(
	*,
	content: str,
	model: str,
	api_key: str,
	base_url: str,
	source_images: List[Dict[str, Any]],
) -> Dict[str, Any]:
	try:
		parsed = _extract_first_json_object(str(content or ''))
	except ModelResponseParseError as exc:
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
	return _postprocess_scene_result(parsed, source_images=source_images)


def _media_root_path() -> Path:
	return Path(getattr(settings, 'MEDIA_ROOT', '') or Path.cwd() / 'media').resolve()


def _path_under_media_root(path_obj: Path) -> bool:
	media_root = _media_root_path()
	try:
		candidate = path_obj.resolve()
	except Exception:
		return False
	return candidate == media_root or media_root in candidate.parents


def _try_media_file_from_url(raw_url: str) -> Optional[Path]:
	url = str(raw_url or '').strip()
	if not url:
		return None
	try:
		parsed = urllib.parse.urlparse(url)
		path = parsed.path or ''
	except Exception:
		path = url

	media_url = str(getattr(settings, 'MEDIA_URL', '/media/') or '/media/')
	if not media_url.startswith('/'):
		media_url = '/' + media_url
	if not media_url.endswith('/'):
		media_url += '/'

	if not path.startswith(media_url):
		return None

	rel = path[len(media_url):]
	if not rel:
		return None

	media_root = _media_root_path()
	try:
		candidate = (media_root / rel).resolve()
	except Exception:
		return None
	if media_root not in candidate.parents and candidate != media_root:
		return None
	return candidate


def _guess_image_mime(path_obj: Path) -> str:
	mime_type, _ = mimetypes.guess_type(str(path_obj))
	mime = str(mime_type or '').strip().lower()
	if mime.startswith('image/'):
		return mime
	ext = str(path_obj.suffix or '').strip().lower()
	if ext in ('.jpg', '.jpeg'):
		return 'image/jpeg'
	if ext == '.webp':
		return 'image/webp'
	if ext == '.gif':
		return 'image/gif'
	return 'image/png'


def _encode_image_file_to_data_url(path_obj: Path) -> str:
	path_resolved = path_obj.expanduser().resolve()
	if not path_resolved.is_file():
		raise RuntimeError(f'image file not found: {path_resolved}')
	data = path_resolved.read_bytes()
	if not data:
		raise RuntimeError(f'image file is empty: {path_resolved}')
	if len(data) > MAX_ARK_BASE64_IMAGE_BYTES:
		raise RuntimeError('image file is too large for Ark base64 upload (>10MB)')
	mime = _guess_image_mime(path_resolved)
	encoded = base64.b64encode(data).decode('ascii')
	return f'data:{mime};base64,{encoded}'


def _looks_like_local_path(value: str) -> bool:
	v = str(value or '').strip()
	return bool(v) and (bool(re.match(r'^[a-zA-Z]:[\\/]', v)) or v.startswith('/') or v.startswith('\\\\'))


def _normalize_image_ref_for_ark(image_ref: str) -> str:
	value = str(image_ref or '').strip()
	if not value:
		raise RuntimeError('image reference is required')
	if value.startswith('data:image/'):
		return value
	if value.startswith('blob:'):
		raise RuntimeError('blob URL cannot be used by backend directly; upload or convert it before invoking scene understand')
	media_file = _try_media_file_from_url(value)
	if media_file is not None:
		if not _path_under_media_root(media_file):
			raise RuntimeError('resolved media path is outside MEDIA_ROOT')
		return _encode_image_file_to_data_url(media_file)
	if value.startswith('file://'):
		parsed = urllib.parse.urlparse(value)
		local_path = urllib.request.url2pathname(parsed.path or '')
		if parsed.netloc and not local_path:
			local_path = urllib.request.url2pathname(parsed.netloc)
		return _encode_image_file_to_data_url(Path(local_path))
	if _looks_like_local_path(value):
		return _encode_image_file_to_data_url(Path(value))
	parsed = urllib.parse.urlparse(value)
	if parsed.scheme in ('http', 'https'):
		hostname = str(parsed.hostname or '').strip().lower()
		if hostname in ('127.0.0.1', 'localhost', '0.0.0.0'):
			raise RuntimeError('local loopback image URL is not publicly reachable by Ark; please use MEDIA file or data URL')
		return value
	return value


def _model_option(model_id: str) -> Optional[Dict[str, Any]]:
	resolved = str(model_id or '').strip()
	if not resolved:
		return None
	for item in SCENE_UNDERSTAND_MODEL_OPTIONS:
		if str(item.get('id') or '').strip() == resolved:
			return item
	return None


def _build_mock_result(prompt_text: str, image_ref: str, model: str) -> Dict[str, Any]:
	objects = [
		{
			'id': 'obj-wall-001',
			'name': 'background_wall',
			'category': 'architecture',
			'subCategory': 'wall',
			'material': 'paint',
			'surfaceType': 'wall',
			'position': {'x': 0.0, 'y': 1.5, 'z': -2.6},
			'rotation': {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0},
			'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
			'size': {'width': 6.0, 'height': 3.0, 'depth': 0.15},
			'imageRect': {'x': 0.02, 'y': 0.08, 'width': 0.96, 'height': 0.62},
			'description': '主要背景墙面。',
		},
		{
			'id': 'obj-floor-001',
			'name': 'floor',
			'category': 'architecture',
			'subCategory': 'floor',
			'material': 'wood',
			'surfaceType': 'floor',
			'position': {'x': 0.0, 'y': 0.0, 'z': 0.0},
			'rotation': {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0},
			'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
			'size': {'width': 6.0, 'height': 0.2, 'depth': 5.0},
			'imageRect': {'x': 0.0, 'y': 0.75, 'width': 1.0, 'height': 0.25},
			'description': '地面占位，供布局节点生成基础空间。',
		},
		{
			'id': 'obj-table-001',
			'name': 'desktop_table',
			'category': 'furniture',
			'subCategory': 'table',
			'material': 'wood',
			'surfaceType': 'desktop',
			'position': {'x': 0.1, 'y': 0.78, 'z': -0.35},
			'rotation': {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0},
			'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
			'size': {'width': 2.2, 'height': 0.08, 'depth': 1.1},
			'imageRect': {'x': 0.22, 'y': 0.52, 'width': 0.48, 'height': 0.12},
			'description': '桌面主平台。',
		},
		{
			'id': 'obj-book-001',
			'name': 'red_book',
			'category': 'book',
			'subCategory': 'desktop-item',
			'material': 'paper',
			'surfaceType': 'desktop',
			'position': {'x': -0.25, 'y': 0.86, 'z': -0.15},
			'rotation': {'yaw': 2.0, 'pitch': 0.0, 'roll': 0.0},
			'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
			'size': {'width': 0.24, 'height': 0.04, 'depth': 0.18},
			'imageRect': {'x': 0.31, 'y': 0.58, 'width': 0.08, 'height': 0.05},
			'description': '桌面上的书本 1。',
		},
		{
			'id': 'obj-book-002',
			'name': 'blue_book',
			'category': 'book',
			'subCategory': 'desktop-item',
			'material': 'paper',
			'surfaceType': 'desktop',
			'position': {'x': 0.02, 'y': 0.86, 'z': -0.14},
			'rotation': {'yaw': -4.0, 'pitch': 0.0, 'roll': 0.0},
			'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
			'size': {'width': 0.25, 'height': 0.04, 'depth': 0.18},
			'imageRect': {'x': 0.41, 'y': 0.58, 'width': 0.08, 'height': 0.05},
			'description': '桌面上的书本 2，与红色书大小接近，仅颜色不同。',
		},
	]
	payload = {
		'sceneSummary': '当前返回为本地 mock 室内场景理解结果，可用于前端 JSON 流转和布局调试。',
		'sceneType': 'interior-design',
		'analysisPriority': ['wall', 'desktop', 'wall-decoration', 'floor-items', 'desktop-items'],
		'camera': {'view': 'front-perspective', 'fovEstimate': 55},
		'source': {'model': model, 'imageRef': image_ref, 'mock': True},
		'promptEcho': prompt_text,
		'objects': objects,
	}
	payload = _postprocess_scene_result(payload)
	output = json.dumps(payload, ensure_ascii=False, indent=2)
	return {
		'ok': True,
		'model': model,
		'outputJson': output,
		'summary': f'生成 {len(objects)} 个场景对象（mock）。',
		'mock': True,
	}


def _call_ark_scene_understand(model: str, prompt_text: str, image_inputs: List[Dict[str, Any]]) -> Dict[str, Any]:
	config = get_bytedance_text_cfg()
	api_key = str(config.get('api_key') or '').strip()
	base_url = str(config.get('base_url') or '').strip()
	if not api_key:
		raise RuntimeError('missing scene understand api key')
	if not base_url:
		raise RuntimeError('missing scene understand service base url')
	model_meta = _model_option(model) or {}
	supports_structured = bool(model_meta.get('supportsStructuredOutput'))
	context_model = _resolve_context_model_id(model)
	if not image_inputs:
		raise RuntimeError('image reference is required')
	messages = _build_scene_understand_messages(prompt_text, image_inputs)
	context_seed_messages, first_turn_messages = _split_scene_understand_messages(messages)

	last_error: Optional[Exception] = None
	attempt_response_formats: List[Optional[Dict[str, Any]]] = []
	if supports_structured:
		attempt_response_formats.append({'type': 'json_object'})
	attempt_response_formats.append(None)

	content = ''
	for response_format in attempt_response_formats:
		try:
			context_id: Optional[str] = None
			use_context = bool(context_model)
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
				usage_box: Dict[str, Any] = {}
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
			candidate_content = str(content or '')
			parsed, candidate_content, rewrite_used, rewrite_attempts = _finalize_scene_understand_candidate(
				model=model,
				api_key=api_key,
				base_url=base_url,
				messages=messages,
				candidate_content=candidate_content,
				source_images=image_inputs,
				context_id=context_id,
			)
			output_json = json.dumps(parsed, ensure_ascii=False, indent=2)
			objects = parsed.get('objects') if isinstance(parsed, dict) else []
			count = len(objects) if isinstance(objects, list) else 0
			return {
				'ok': True,
				'model': model,
				'outputJson': output_json,
				'rawOutput': candidate_content,
				'rewriteUsed': rewrite_used,
				'rewriteAttempts': rewrite_attempts,
				'summary': f'识别到 {count} 个场景对象。',
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
		raise RuntimeError(f'ark returned malformed scene JSON: {last_error.detail}') from last_error
	if last_error is not None:
		raise RuntimeError(f'ark request failed: {last_error}') from last_error
	raise RuntimeError('ark response content is empty')


def run_scene_understand(
	*,
	node_id: str,
	model: str,
	prompt_text: str,
	image_url: str,
	image_data_url: str,
	image_inputs: Any = None,
) -> Dict[str, Any]:
	resolved_model = model or DEFAULT_SCENE_UNDERSTAND_MODEL
	try:
		normalized_inputs = _normalize_scene_understand_inputs(image_inputs, image_url, image_data_url)
	except Exception as exc:
		return {'ok': False, 'error': str(exc or 'invalid image input')}
	if not normalized_inputs:
		return {'ok': False, 'error': 'imageUrl or imageDataUrl is required'}

	try:
		return _call_ark_scene_understand(resolved_model, prompt_text, normalized_inputs)
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
			'error': f'远端服务返回的场景 JSON 无法解析：{exc.detail}',
			'model': resolved_model,
			'status': 502,
			'provider': exc.provider,
			'providerStatusText': '远端服务返回了不可解析的结构化结果',
		}
	except Exception as exc:
		if not ALLOW_SCENE_UNDERSTAND_MOCK_FALLBACK:
			error_text = str(exc or 'unknown error')
			if 'malformed scene JSON' in error_text:
				return {
					'ok': False,
					'error': f'远端服务返回的场景 JSON 无法解析：{error_text.split("malformed scene JSON:", 1)[-1].strip()}',
					'model': resolved_model,
					'status': 502,
					'provider': 'volcengine-ark',
					'providerStatusText': '远端服务返回了不可解析的结构化结果',
				}
			return {
				'ok': False,
				'error': f'场景理解真实接口调用失败：{error_text}',
				'model': resolved_model,
				'status': 500,
				'provider': 'volcengine-ark',
				'providerStatusText': '服务端场景理解封装失败',
			}
		return _build_mock_result(prompt_text, str(normalized_inputs[0].get('imageRef') or '')[:64], resolved_model)


def stream_scene_understand(
	*,
	node_id: str,
	model: str,
	prompt_text: str,
	image_url: str,
	image_data_url: str,
	image_inputs: Any = None,
) -> Generator[Dict[str, Any], None, None]:
	resolved_model = model or DEFAULT_SCENE_UNDERSTAND_MODEL
	try:
		normalized_inputs = _normalize_scene_understand_inputs(image_inputs, image_url, image_data_url)
	except Exception as exc:
		yield _agent_to_ui_error('bad_input', str(exc or 'invalid image input'))
		return
	if not normalized_inputs:
		yield _agent_to_ui_error('bad_request', 'imageUrl or imageDataUrl is required')
		return

	config = get_bytedance_text_cfg()
	api_key = str(config.get('api_key') or '').strip()
	base_url = str(config.get('base_url') or '').strip()
	if not api_key:
		yield _agent_to_ui_error('missing_config', 'missing scene understand api key', details={'provider': 'volcengine-ark'})
		return
	if not base_url:
		yield _agent_to_ui_error('missing_config', 'missing scene understand service base url', details={'provider': 'volcengine-ark'})
		return

	model_meta = _model_option(resolved_model) or {}
	supports_structured = bool(model_meta.get('supportsStructuredOutput'))
	context_model = _resolve_context_model_id(resolved_model)
	messages = _build_scene_understand_messages(prompt_text, normalized_inputs)
	context_seed_messages, first_turn_messages = _split_scene_understand_messages(messages)

	yield _agent_to_ui_task_status('started', message='场景理解已开始')
	yield _agent_to_ui_task_status('prepare_input', message='输入图片已规范化，准备发送到远端服务')
	yield _agent_to_ui_task_status('connect', message='正在连接多模态模型服务')
	yield _agent_to_ui_task_status('submit', message=f'已提交场景理解请求到 {resolved_model}')

	out_q: 'queue.Queue[tuple[str, Dict[str, Any] | None]]' = queue.Queue()
	finished = {'done': False}

	def _emit_msg(payload: Dict[str, Any]) -> None:
		out_q.put(('msg', payload))

	def _emit_done() -> None:
		out_q.put(('done', None))

	def _worker() -> None:
		last_error: Optional[Exception] = None
		attempt_response_formats: List[Optional[Dict[str, Any]]] = []
		if supports_structured:
			attempt_response_formats.append({'type': 'json_object'})
		attempt_response_formats.append(None)

		try:
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
							_emit_msg(_agent_to_ui_task_status('submit', message=f'已创建上下文缓存并提交场景理解请求到 {context_model}'))
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
					for delta in _stream_scene_understand_initial_response(
						use_context=use_context,
						base_url=base_url.rstrip('/'),
						api_key=api_key,
						model=context_model if use_context and context_model else resolved_model,
						context_id=context_id,
						messages=first_turn_messages if use_context else messages,
						response_format=response_format,
						on_usage=lambda usage: cache_usage_box.update({'usage': usage}),
						timeout_s=None,
					):
						if not delta:
							continue
						buf += delta
						_emit_msg(_agent_to_ui_text(delta, source_model=resolved_model, source_name='volcengine-ark'))
						chunk_count += 1
						if first_delta:
							first_delta = False
							_emit_msg(_agent_to_ui_task_status('streaming', message='远端服务已开始流式返回内容'))
						if chunk_count % 8 == 1:
							_emit_msg(_agent_to_ui_task_status('writing', message=f'已接收远端返回片段，累计 {len(buf)} chars'))

					if not str(buf or '').strip():
						continue

					candidate_content = str(buf or '')
					rewrite_used = False
					rewrite_attempts = 0
					parse_error: Optional[Exception] = None
					for continuation_attempt in range(1, SCENE_JSON_CONTINUATION_MAX_ATTEMPTS + 1):
						_emit_msg(_agent_to_ui_task_status('parse', message='正在解析远端返回的 JSON'))
						try:
							parsed = _parse_scene_understand_content(
								content=candidate_content,
								model=resolved_model,
								api_key=api_key,
								base_url=base_url,
								source_images=normalized_inputs,
							)
							break
						except ModelResponseParseError as exc:
							parse_error = exc
							if continuation_attempt >= SCENE_JSON_CONTINUATION_MAX_ATTEMPTS or not _scene_json_should_continue(candidate_content, exc):
								parsed = None
								break
							_emit_msg(
								_agent_to_ui_task_status(
									'rewrite',
									message=f'检测到输出可能被截断，正在按续写模式继续补全（第 {continuation_attempt} 次）',
									details={'continuationAttempt': continuation_attempt, 'rewriteReason': 'continuation'},
								)
							)
							continued = _stream_scene_json_continuation(
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
					else:
						parsed = None

					if parsed is None and _scene_json_needs_rewrite(candidate_content, parse_error):
						for rewrite_attempt in range(1, SCENE_JSON_REWRITE_MAX_ATTEMPTS + 1):
							_emit_msg(
								_agent_to_ui_task_status(
									'writing',
									message=f'续写仍未闭合，正在发起第 {rewrite_attempt} 次紧凑重写兜底',
									details={'resetDraft': True, 'rewriteAttempt': rewrite_attempt, 'rewriteReason': 'fallback-rewrite'},
								)
							)
							rewrite_buf = ''
							stream_failed = False
							for rewrite_response_format in ({'type': 'json_object'}, None):
								rewrite_buf = ''
								try:
									for rewrite_delta in _stream_scene_json_rewrite(
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
							_emit_msg(_agent_to_ui_task_status('parse', message='正在解析紧凑重写后的 JSON'))
							parsed = _parse_scene_understand_content(
								content=candidate_content,
								model=resolved_model,
								api_key=api_key,
								base_url=base_url,
								source_images=normalized_inputs,
							)
							break

					if parsed is None:
						if parse_error is not None:
							raise parse_error
						raise ModelResponseParseError('模型未返回可解析 JSON')
					output_json = json.dumps(parsed, ensure_ascii=False, indent=2)
					objects = parsed.get('objects') if isinstance(parsed, dict) else []
					count = len(objects) if isinstance(objects, list) else 0
					result_payload = {
						'ok': True,
						'model': resolved_model,
						'outputJson': output_json,
						'rawOutput': candidate_content,
						'rewriteUsed': rewrite_used,
						'rewriteAttempts': rewrite_attempts,
						'summary': f'识别到 {count} 个场景对象。',
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
					_emit_msg(_agent_to_ui_task_status('done', message='场景理解完成'))
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
				_emit_msg(
					_agent_to_ui_error(
						'upstream_http_error',
						f'远端服务返回错误：{last_error.detail}',
						details={
							'provider': last_error.provider,
							'status': last_error.status_code,
							'remoteStatusCode': last_error.status_code,
							'providerStatusText': f'远端服务 HTTP {last_error.status_code}',
						},
					)
				)
			elif isinstance(last_error, RemoteProviderNetworkError):
				_emit_msg(
					_agent_to_ui_error(
						'upstream_network_error',
						f'远端服务网络请求失败：{last_error.detail}',
						details={
							'provider': last_error.provider,
							'status': 502,
							'providerStatusText': '等待远端服务响应时发生网络异常',
						},
					)
				)
			elif isinstance(last_error, ModelResponseParseError):
				_emit_msg(
					_agent_to_ui_error(
						'invalid_model_json',
						f'远端服务返回的场景 JSON 无法解析：{last_error.detail}',
						details={
							'provider': last_error.provider,
							'status': 502,
							'providerStatusText': '远端服务返回了不可解析的结构化结果',
							'rawPreview': last_error.raw_preview,
						},
					)
				)
			elif last_error is not None:
				_emit_msg(
					_agent_to_ui_error(
						'scene_understand_error',
						f'场景理解真实接口调用失败：{str(last_error or "unknown error")}',
						details={
							'provider': 'volcengine-ark',
							'status': 500,
							'providerStatusText': '服务端场景理解封装失败',
						},
					)
				)
			else:
				_emit_msg(_agent_to_ui_error('empty_response', 'ark response content is empty', details={'provider': 'volcengine-ark'}))
		except Exception as exc:
			_emit_msg(_agent_to_ui_error('scene_understand_stream_error', str(exc or 'unknown error'), details={'provider': 'volcengine-ark'}))
		finally:
			finished['done'] = True
			_emit_done()

	thread = threading.Thread(target=_worker, name=f'scene-understand-{node_id or resolved_model}', daemon=True)
	thread.start()

	heartbeats = [
		'远端服务已收到请求，等待首个流式分片…',
		'正在等待远端生成结构化场景理解结果…',
		'远端仍在处理中，保持 SSE 连接中…',
	]
	heartbeat_idx = 0
	last_emit_at = time.time()

	while True:
		try:
			kind, payload = out_q.get(timeout=1.0)
		except queue.Empty:
			if finished['done']:
				break
			now = time.time()
			if now - last_emit_at >= 1.0:
				yield _agent_to_ui_task_status('streaming', message=heartbeats[heartbeat_idx % len(heartbeats)])
				heartbeat_idx += 1
				last_emit_at = now
			continue

		if kind == 'done':
			break
		if kind == 'msg' and payload is not None:
			last_emit_at = time.time()
			yield payload
