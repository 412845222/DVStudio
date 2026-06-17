from __future__ import annotations

from typing import Any, Dict, List, Optional


GROUP_COLORS = [
    '#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#f87171', '#22d3ee', '#facc15'
]

FLOOR_WORDS = ['floor', 'ground', '地面', '地板', '地坪']
WALL_WORDS = ['wall', '墙面', '墙体']
CEILING_WORDS = ['ceiling', 'roof', 'top-slab', '天花', '天花板', '顶面', '屋顶']
NON_STRUCTURE_CATEGORIES = {'lighting', 'light', 'lamp', 'electronics', 'appliance', 'device'}
KEY_ELEMENT_TYPES = {'floor', 'wall', 'ceiling', 'roof', 'window', 'column', 'pillar', 'door', 'opening', 'builtin-fixture', 'fixed-installation'}


def _is_primary_reference_item(item: Dict[str, Any]) -> bool:
    observed = item.get('observedImageIndices')
    if isinstance(observed, list):
        for value in observed:
            if int(_to_float(value, 0.0) or 0) == 1:
                return True
    return int(_to_float(item.get('sourceImageIndex'), 1.0) or 1) == 1


def _normalize_string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(item or '').strip().lower() for item in value if str(item or '').strip()]


def _to_float(value: Any, default: float) -> float:
    try:
        number = float(value)
    except Exception:
        return default
    if number != number:
        return default
    return number


def _as_dict(raw: Any) -> Dict[str, Any]:
    return dict(raw) if isinstance(raw, dict) else {}


def _text_match(value: str, words: List[str]) -> bool:
    v = str(value or '').strip().lower()
    if not v:
        return False
    return any(word in v for word in words)


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


def _semantic_structure_kind(item: Dict[str, Any]) -> str:
    category = str(item.get('category') or '').strip().lower()
    sub_category = str(item.get('subCategory') or '').strip().lower()
    surface_type = str(item.get('surfaceType') or '').strip().lower()
    item_id = str(item.get('id') or '').strip().lower()
    name = str(item.get('name') or '').strip().lower()
    placement = str(item.get('placement') or '').strip().lower()
    support_surface = str(item.get('supportSurface') or '').strip().lower()
    wall_role = _canonical_wall_role(item.get('wallRole'))
    key_element_type = str(item.get('keyElementType') or '').strip().lower()
    semantic = ' '.join(part for part in [category, sub_category, surface_type] if part)
    fixture_hint = ' '.join(part for part in [category, sub_category, item_id, name] if part)
    if _text_match(fixture_hint, ['light', 'lamp', 'lighting', '吊灯', '壁灯', '吸顶灯', '灯具', '主灯']):
        return ''
    if key_element_type in ('floor', 'wall', 'ceiling', 'roof'):
        return 'ceiling' if key_element_type == 'roof' else key_element_type
    if category in NON_STRUCTURE_CATEGORIES or sub_category in NON_STRUCTURE_CATEGORIES:
        return ''
    if _text_match(semantic, FLOOR_WORDS):
        return 'floor'
    if _text_match(semantic, CEILING_WORDS) or placement == 'ceiling-shell':
        return 'ceiling'
    if _text_match(semantic, WALL_WORDS):
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
    if name.endswith('墙') or name.endswith('wall') or '墙面' in name or '墙体' in name:
        return 'wall'
    if _text_match(name, FLOOR_WORDS):
        return 'floor'
    if _text_match(name, CEILING_WORDS):
        return 'ceiling'
    return ''


def _is_floor_like(item: Dict[str, Any]) -> bool:
    return _semantic_structure_kind(item) == 'floor'


def _is_wall_like(item: Dict[str, Any]) -> bool:
    return _semantic_structure_kind(item) == 'wall'


def _is_ceiling_like(item: Dict[str, Any]) -> bool:
    return _semantic_structure_kind(item) == 'ceiling'


def _nearest_cardinal_yaw(yaw: float) -> float:
    options = [0.0, 90.0, 180.0, 270.0, 360.0]
    value = yaw % 360.0
    closest = min(options, key=lambda target: abs(target - value))
    return 0.0 if closest >= 360.0 else closest


def _normalize_bottom_y(position_y: float, height: float, *, floor: bool = False, wall: bool = False) -> float:
    if floor:
        return 0.0
    if wall:
        return max(0.0, position_y - height * 0.5) if position_y >= height * 0.6 else max(0.0, position_y)
    if position_y >= height * 0.6:
        return max(0.0, position_y - height * 0.5)
    return max(0.0, position_y)


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _effective_size(item: Dict[str, Any]) -> Dict[str, float]:
    size = _as_dict(item.get('size'))
    scale = _as_dict(item.get('scale'))
    return {
        'width': max(0.05, _to_float(size.get('width'), 1.0) * _to_float(scale.get('x'), 1.0)),
        'height': max(0.05, _to_float(size.get('height'), 1.0) * _to_float(scale.get('y'), 1.0)),
        'depth': max(0.05, _to_float(size.get('depth'), 1.0) * _to_float(scale.get('z'), 1.0)),
    }


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


def _resolve_wall_role(item: Dict[str, Any]) -> str:
    role = _canonical_wall_role(item.get('wallRole'))
    if role:
        return role
    position = _as_dict(item.get('position'))
    yaw = _nearest_cardinal_yaw(_to_float(_as_dict(item.get('rotation')).get('yaw'), 0.0))
    if yaw in (0.0, 180.0):
        return 'front' if _to_float(position.get('z'), 0.0) <= 0.0 else 'back'
    return 'left' if _to_float(position.get('x'), 0.0) <= 0.0 else 'right'


def _wall_role_yaw(role: str) -> float:
    if role == 'left':
        return 90.0
    if role == 'right':
        return 270.0
    if role == 'front':
        return 180.0
    return 0.0


def _resolve_open_wall_role(payload: Dict[str, Any]) -> str:
    camera = _as_dict(payload.get('camera'))
    explicit = _canonical_wall_role(camera.get('openWallRole'))
    if explicit:
        return explicit
    raw_view = camera.get('view')
    first = ''
    if isinstance(raw_view, list) and raw_view:
        first = str(raw_view[0] or '').strip().lower()
    else:
        first = str(raw_view or '').strip().lower()
    if any(token in first for token in ['front', '前向', '正前', '正视', '朝前']):
        return 'front'
    if any(token in first for token in ['back', 'rear', '后向', '朝后']):
        return 'back'
    if any(token in first for token in ['left', '左向', '朝左']):
        return 'left'
    if any(token in first for token in ['right', '右向', '朝右']):
        return 'right'
    return ''


def _normalize_object(item: Dict[str, Any], index: int) -> Dict[str, Any]:
    raw_position = item.get('position')
    raw_size = item.get('size')
    raw_rotation = item.get('rotation')
    raw_scale = item.get('scale')
    position: Dict[str, Any] = dict(raw_position) if isinstance(raw_position, dict) else {}
    size: Dict[str, Any] = dict(raw_size) if isinstance(raw_size, dict) else {}
    rotation: Dict[str, Any] = dict(raw_rotation) if isinstance(raw_rotation, dict) else {}
    scale: Dict[str, Any] = dict(raw_scale) if isinstance(raw_scale, dict) else {}
    return {
        'id': str(item.get('id') or f'layout-{index + 1}'),
        'name': str(item.get('name') or f'object_{index + 1}'),
        'category': str(item.get('category') or 'object'),
        'subCategory': str(item.get('subCategory') or ''),
        'surfaceType': str(item.get('surfaceType') or ''),
        'sameTypeGroupId': str(item.get('sameTypeGroupId') or ''),
        'sameTypeGroupLabel': str(item.get('sameTypeGroupLabel') or ''),
        'isKeyElement': bool(item.get('isKeyElement')),
        'keyElementType': str(item.get('keyElementType') or '').strip().lower(),
        'fixedInRoom': bool(item.get('fixedInRoom')),
        'semanticRole': str(item.get('semanticRole') or '').strip().lower(),
        'mountType': str(item.get('mountType') or '').strip().lower(),
        'shouldTouchGround': bool(item.get('shouldTouchGround')) if isinstance(item.get('shouldTouchGround'), bool) else None,
        'groundReason': str(item.get('groundReason') or ''),
        'relationTags': _normalize_string_list(item.get('relationTags')),
        'layoutPriority': _to_float(item.get('layoutPriority'), 0.0),
        'parentId': str(item.get('parentId') or ''),
        'placement': str(item.get('placement') or ''),
        'supportSurface': str(item.get('supportSurface') or ''),
        'anchor': str(item.get('anchor') or ''),
        'wallRole': str(item.get('wallRole') or ''),
        'proximityGroupId': str(item.get('proximityGroupId') or ''),
        'relationReason': str(item.get('relationReason') or ''),
        'inferred': bool(item.get('inferred')),
        'observedImageIndices': [
            int(value)
            for value in (item.get('observedImageIndices') or [])
            if int(_to_float(value, 0.0) or 0) > 0
        ] if isinstance(item.get('observedImageIndices'), list) else [],
        'color': str(item.get('color') or ''),
        'position': {
            'x': _to_float(position.get('x'), float(index) * 1.8),
            'y': _to_float(position.get('y'), 0.0),
            'z': _to_float(position.get('z'), 0.0),
        },
        'size': {
            'width': max(0.05, _to_float(size.get('width'), 1.0)),
            'height': max(0.05, _to_float(size.get('height'), 1.0)),
            'depth': max(0.05, _to_float(size.get('depth'), 1.0)),
        },
        'rotation': {
            'yaw': _to_float(rotation.get('yaw'), 0.0),
            'pitch': _to_float(rotation.get('pitch'), 0.0),
            'roll': _to_float(rotation.get('roll'), 0.0),
        },
        'scale': {
            'x': max(0.01, _to_float(scale.get('x'), 1.0)),
            'y': max(0.01, _to_float(scale.get('y'), 1.0)),
            'z': max(0.01, _to_float(scale.get('z'), 1.0)),
        },
    }


def _normalize_key_elements(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    raw = payload.get('keyElements')
    if not isinstance(raw, list):
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        item_id = str(entry.get('id') or '').strip()
        if not item_id:
            continue
        out[item_id] = {
            'isKeyElement': True,
            'keyElementType': str(entry.get('type') or '').strip().lower(),
            'fixedInRoom': bool(entry.get('fixed')),
            'semanticRole': str(entry.get('role') or '').strip().lower(),
            'mountType': str(entry.get('mountType') or '').strip().lower(),
            'layoutPriority': _to_float(entry.get('priority'), 0.0),
            'relationTags': _normalize_string_list(entry.get('relationTags')),
        }
    return out


def _apply_key_element_semantics(item: Dict[str, Any]) -> Dict[str, Any]:
    key_element_type = str(item.get('keyElementType') or '').strip().lower()
    if not key_element_type:
        key_element_type = _semantic_structure_kind(item)
    mount_type = str(item.get('mountType') or '').strip().lower()
    placement = str(item.get('placement') or '').strip().lower()
    support_surface = str(item.get('supportSurface') or '').strip().lower()
    if not mount_type:
        if key_element_type in ('floor',):
            mount_type = 'floor'
        elif key_element_type in ('wall',):
            mount_type = 'wall'
        elif key_element_type in ('ceiling', 'roof'):
            mount_type = 'ceiling'
        elif placement == 'attached-to-wall':
            mount_type = 'embedded-wall' if 'embedded' in _normalize_string_list(item.get('relationTags')) or key_element_type in ('window', 'builtin-fixture', 'opening', 'door') else 'wall'
        elif placement == 'attached-to-ceiling' or support_surface == 'ceiling':
            mount_type = 'ceiling'
        elif placement == 'on-top':
            mount_type = 'support-top'
        elif placement == 'on-floor' or support_surface == 'floor':
            mount_type = 'floor'
        else:
            mount_type = 'free'
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
        elif mount_type == 'support-top':
            semantic_role = 'support-object'
        elif mount_type == 'floor':
            semantic_role = 'floor-object'
        else:
            semantic_role = 'furniture'
    relation_tags = _normalize_string_list(item.get('relationTags'))
    is_key = bool(item.get('isKeyElement')) or key_element_type in KEY_ELEMENT_TYPES
    if is_key and 'key-element' not in relation_tags:
        relation_tags.append('key-element')
    if semantic_role == 'structure-shell' and 'structural-shell' not in relation_tags:
        relation_tags.append('structural-shell')
    fixed = bool(item.get('fixedInRoom')) or key_element_type in {'floor', 'wall', 'ceiling', 'roof', 'window', 'column', 'pillar', 'door', 'opening'}
    priority = _to_float(item.get('layoutPriority'), 0.0)
    if priority <= 0:
        if semantic_role == 'structure-shell':
            priority = 100.0
        elif fixed:
            priority = 90.0
        elif mount_type in ('embedded-wall', 'wall', 'ceiling'):
            priority = 70.0
        elif mount_type == 'support-top':
            priority = 50.0
        else:
            priority = 30.0
    item['keyElementType'] = key_element_type
    item['mountType'] = mount_type
    item['semanticRole'] = semantic_role
    item['relationTags'] = relation_tags
    item['isKeyElement'] = is_key
    item['fixedInRoom'] = fixed
    item['layoutPriority'] = priority
    return item


def _normalize_non_structure_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for item in items:
        kind = _semantic_structure_kind(item)
        position = _as_dict(item.get('position'))
        rotation = _as_dict(item.get('rotation'))
        size = _as_dict(item.get('size'))
        height = max(0.05, _to_float(size.get('height'), 1.0))
        position['y'] = _normalize_bottom_y(
            _to_float(position.get('y'), 0.0),
            height,
            floor=(kind == 'floor'),
            wall=(kind == 'wall'),
        )
        item['position'] = position
        item['rotation'] = {
            'yaw': _to_float(rotation.get('yaw'), 0.0),
            'pitch': 0.0 if kind in ('floor', 'wall', 'ceiling') else _to_float(rotation.get('pitch'), 0.0),
            'roll': 0.0 if kind in ('floor', 'wall', 'ceiling') else _to_float(rotation.get('roll'), 0.0),
        }
    return items


def _apply_group_colors(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    group_color_map: Dict[str, str] = {}
    next_color_index = 0
    for item in items:
        group_id = str(item.get('sameTypeGroupId') or '').strip()
        if not group_id:
            group_id = f"single-{item.get('id') or len(group_color_map) + 1}"
            item['sameTypeGroupId'] = group_id
            item['sameTypeGroupLabel'] = str(item.get('sameTypeGroupLabel') or item.get('name') or 'object')
        if group_id not in group_color_map:
            group_color_map[group_id] = GROUP_COLORS[next_color_index % len(GROUP_COLORS)]
            next_color_index += 1
        item['color'] = str(item.get('color') or group_color_map[group_id])
    return items


def _largest_by_area(items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not items:
        return None
    return max(items, key=lambda item: _effective_size(item)['width'] * _effective_size(item)['depth'])


def _resolve_shell_footprint_source(
    floor_items: List[Dict[str, Any]],
    ceiling_items: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    return _largest_by_area(floor_items) or _largest_by_area(ceiling_items)


def _derive_room_shell_candidate(items: List[Dict[str, Any]], *, raw_shell: Dict[str, Any]) -> Dict[str, Any]:
    raw_center_x = _to_float(raw_shell.get('centerX'), 0.0)
    raw_center_z = _to_float(raw_shell.get('centerZ'), 0.0)
    raw_width = _to_float(raw_shell.get('width'), 0.0)
    raw_depth = _to_float(raw_shell.get('depth'), 0.0)
    raw_height = _to_float(raw_shell.get('height'), 0.0)
    raw_thickness = max(0.05, _to_float(raw_shell.get('wallThickness'), 0.15))
    floor_items = [item for item in items if _is_floor_like(item)]
    wall_items = [item for item in items if _is_wall_like(item)]
    ceiling_items = [item for item in items if _is_ceiling_like(item)]
    content_items = [item for item in items if _semantic_structure_kind(item) == '']
    min_x = max_x = min_z = max_z = None
    detected_walls: List[str] = []
    wall_height = 0.0
    wall_thickness = raw_thickness
    use_raw_shell_bounds = raw_width > 0 and raw_depth > 0
    floor_item = _largest_by_area(floor_items)
    ceiling_item = _largest_by_area(ceiling_items)
    footprint_source = _resolve_shell_footprint_source(floor_items, ceiling_items)
    if footprint_source is not None:
        footprint_min_x, footprint_max_x, footprint_min_z, footprint_max_z = _bounds_xz(footprint_source)
        footprint_width = max(1.5, footprint_max_x - footprint_min_x)
        footprint_depth = max(1.5, footprint_max_z - footprint_min_z)
        footprint_center_x = (footprint_min_x + footprint_max_x) * 0.5
        footprint_center_z = (footprint_min_z + footprint_max_z) * 0.5
        raw_shell_too_small = (
            raw_width <= 0
            or raw_depth <= 0
            or raw_width < footprint_width * 0.6
            or raw_depth < footprint_depth * 0.6
        )
        raw_shell_far_off = (
            abs(raw_center_x - footprint_center_x) > max(0.6, footprint_width * 0.2)
            or abs(raw_center_z - footprint_center_z) > max(0.6, footprint_depth * 0.2)
        )
        if raw_shell_too_small or raw_shell_far_off:
            min_x = footprint_min_x
            max_x = footprint_max_x
            min_z = footprint_min_z
            max_z = footprint_max_z
            use_raw_shell_bounds = False
    if use_raw_shell_bounds:
        half_w = raw_width * 0.5
        half_d = raw_depth * 0.5
        min_x = raw_center_x - half_w
        max_x = raw_center_x + half_w
        min_z = raw_center_z - half_d
        max_z = raw_center_z + half_d
    for wall in wall_items:
        role = _resolve_wall_role(wall)
        detected_walls.append(role)
        size = _effective_size(wall)
        wall_thickness = max(0.05, min(wall_thickness, size['depth'])) if raw_thickness > 0 else size['depth']
        wall_height = max(wall_height, size['height'])
        if use_raw_shell_bounds:
            continue
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
    occ_top_y = 0.0
    for item in content_items:
        item_min_x, item_max_x, item_min_z, item_max_z = _bounds_xz(item)
        occ_min_x = item_min_x if occ_min_x is None else min(occ_min_x, item_min_x)
        occ_max_x = item_max_x if occ_max_x is None else max(occ_max_x, item_max_x)
        occ_min_z = item_min_z if occ_min_z is None else min(occ_min_z, item_min_z)
        occ_max_z = item_max_z if occ_max_z is None else max(occ_max_z, item_max_z)
        occ_top_y = max(occ_top_y, _top_y(item))
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
    if max_x <= min_x:
        center_x = ((occ_min_x or 0.0) + (occ_max_x or 0.0)) * 0.5
        min_x = center_x - 2.0
        max_x = center_x + 2.0
    if max_z <= min_z:
        center_z = ((occ_min_z or 0.0) + (occ_max_z or 0.0)) * 0.5
        min_z = center_z - 2.0
        max_z = center_z + 2.0
    floor_height = _effective_size(floor_item)['height'] if floor_item is not None else 0.05
    ceiling_height = _effective_size(ceiling_item)['height'] if ceiling_item is not None else 0.05
    if raw_height > 0 or wall_height > 0:
        height = max(raw_height, wall_height, 2.8)
    else:
        height = max(occ_top_y + 0.6, 2.8)
    if ceiling_item is not None:
        ceiling_position = _as_dict(ceiling_item.get('position'))
        height = max(height, _to_float(ceiling_position.get('y'), 0.0) + _effective_size(ceiling_item)['height'])
    detected_unique = [role for role in ['left', 'right', 'front', 'back'] if role in detected_walls]
    return {
        'centerX': (min_x + max_x) * 0.5,
        'centerZ': (min_z + max_z) * 0.5,
        'width': max(1.5, max_x - min_x),
        'depth': max(1.5, max_z - min_z),
        'height': max(2.4, height),
        'wallThickness': max(0.05, raw_thickness if raw_thickness > 0 else wall_thickness),
        'floorHeight': max(0.05, floor_height),
        'ceilingHeight': max(0.05, ceiling_height),
        'hasFloor': bool(raw_shell.get('hasFloor')) if 'hasFloor' in raw_shell else True,
        'hasCeiling': bool(raw_shell.get('hasCeiling')) if 'hasCeiling' in raw_shell else True,
        'detectedWalls': detected_unique,
        'confidence': max(0.2, min(1.0, _to_float(raw_shell.get('confidence'), 0.4 if detected_unique else 0.25))),
    }


def _blend_room_shell(base_shell: Dict[str, Any], supplement_shell: Dict[str, Any]) -> Dict[str, Any]:
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
    shift_x = _clamp(full_center_x - base_center_x, -base_width * 0.12, base_width * 0.12)
    shift_z = _clamp(full_center_z - base_center_z, -base_depth * 0.12, base_depth * 0.12)
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
        for role in ('left', 'right', 'front', 'back')
        if role in (base_shell.get('detectedWalls') or []) or role in (supplement_shell.get('detectedWalls') or [])
    ]
    merged['confidence'] = max(_to_float(base_shell.get('confidence'), 0.25), _to_float(supplement_shell.get('confidence'), 0.25))
    return merged


def _derive_room_shell(payload: Dict[str, Any], items: List[Dict[str, Any]]) -> Dict[str, Any]:
    raw_shell = _as_dict(payload.get('roomShell'))
    if raw_shell:
        return _derive_room_shell_candidate(items, raw_shell=raw_shell)
    return _derive_room_shell_candidate(items, raw_shell=raw_shell)


def _build_shell_surface(kind: str, shell: Dict[str, Any], role: str = '') -> Dict[str, Any]:
    center_x = _to_float(shell.get('centerX'), 0.0)
    center_z = _to_float(shell.get('centerZ'), 0.0)
    width = max(1.5, _to_float(shell.get('width'), 4.0))
    depth = max(1.5, _to_float(shell.get('depth'), 4.0))
    height = max(2.4, _to_float(shell.get('height'), 2.8))
    wall_thickness = max(0.05, _to_float(shell.get('wallThickness'), 0.15))
    floor_height = max(0.05, _to_float(shell.get('floorHeight'), 0.05))
    ceiling_height = max(0.05, _to_float(shell.get('ceilingHeight'), 0.05))

    base: Dict[str, Any] = {
        'sameTypeGroupId': 'auto-room-shell',
        'sameTypeGroupLabel': 'Room Shell',
        'inferred': True,
        'isKeyElement': True,
        'fixedInRoom': True,
        'semanticRole': 'structure-shell',
        'mountType': 'free',
        'relationTags': ['key-element', 'structural-shell'],
        'layoutPriority': 100.0,
        'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0},
        'rotation': {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0},
        'position': {'x': center_x, 'y': 0.0, 'z': center_z},
    }

    if kind == 'floor':
        base.update(
            {
                'id': 'auto-floor-shell',
                'name': 'auto_floor_shell',
                'category': 'architecture',
                'subCategory': 'floor',
                'keyElementType': 'floor',
                'mountType': 'floor',
                'surfaceType': 'floor',
                'color': '#475569',
                'relationReason': '根据显式 roomShell / 结构面补全地面围合。',
                'placement': 'on-floor',
                'supportSurface': 'floor',
                'anchor': 'center',
                'position': {'x': center_x, 'y': 0.0, 'z': center_z},
                'size': {'width': width, 'height': floor_height, 'depth': depth},
            }
        )
        return base

    if kind == 'ceiling':
        base.update(
            {
                'id': 'auto-ceiling-shell',
                'name': 'auto_ceiling_shell',
                'category': 'architecture',
                'subCategory': 'ceiling',
                'keyElementType': 'ceiling',
                'mountType': 'ceiling',
                'surfaceType': 'ceiling',
                'color': '#64748b',
                'relationReason': '根据显式 roomShell / 结构面补全天花围合。',
                'placement': 'ceiling-shell',
                'supportSurface': 'ceiling',
                'anchor': 'center',
                'parentId': '',
                'position': {'x': center_x, 'y': max(0.0, height - ceiling_height), 'z': center_z},
                'size': {'width': width, 'height': ceiling_height, 'depth': depth},
            }
        )
        return base

    half_w = width * 0.5
    half_d = depth * 0.5
    half_t = wall_thickness * 0.5
    wall_position = {'x': center_x, 'y': 0.0, 'z': center_z}
    yaw = 0.0
    if role == 'left':
        wall_position = {'x': center_x - half_w - half_t, 'y': 0.0, 'z': center_z}
        yaw = 90.0
    elif role == 'right':
        wall_position = {'x': center_x + half_w + half_t, 'y': 0.0, 'z': center_z}
        yaw = 270.0
    elif role == 'front':
        wall_position = {'x': center_x, 'y': 0.0, 'z': center_z - half_d - half_t}
        yaw = 180.0
    elif role == 'back':
        wall_position = {'x': center_x, 'y': 0.0, 'z': center_z + half_d + half_t}
        yaw = 0.0
    base.update(
        {
            'id': f'auto-wall-{role}',
            'name': f'auto_wall_{role}',
            'category': 'architecture',
            'subCategory': 'wall',
            'keyElementType': 'wall',
            'mountType': 'wall',
            'surfaceType': 'wall',
            'wallRole': role,
            'color': '#7c3aed' if role in ('left', 'right') else '#0f766e',
            'relationReason': '根据显式 roomShell / 结构面补全围合墙体。',
            'placement': 'on-floor',
            'supportSurface': 'floor',
            'anchor': 'center',
            'position': wall_position,
            'rotation': {'yaw': yaw, 'pitch': 0.0, 'roll': 0.0},
            'size': {'width': depth if role in ('left', 'right') else width, 'height': height, 'depth': wall_thickness},
        }
    )
    return base


def _merge_shell_item(target: Dict[str, Any], source: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(target)
    merged['id'] = str(source.get('id') or merged.get('id') or '')
    merged['name'] = str(source.get('name') or merged.get('name') or '')
    merged['sameTypeGroupId'] = str(merged.get('sameTypeGroupId') or 'auto-room-shell')
    merged['sameTypeGroupLabel'] = str(merged.get('sameTypeGroupLabel') or 'Room Shell')
    merged['color'] = str(source.get('color') or merged.get('color') or '')
    merged['relationReason'] = str(source.get('relationReason') or merged.get('relationReason') or '')
    merged['inferred'] = bool(source.get('inferred', merged.get('inferred', True)))
    merged['isKeyElement'] = bool(source.get('isKeyElement', merged.get('isKeyElement', False)))
    merged['fixedInRoom'] = bool(source.get('fixedInRoom', merged.get('fixedInRoom', False)))
    merged['keyElementType'] = str(source.get('keyElementType') or merged.get('keyElementType') or '')
    merged['semanticRole'] = str(source.get('semanticRole') or merged.get('semanticRole') or '')
    merged['mountType'] = str(source.get('mountType') or merged.get('mountType') or '')
    merged['relationTags'] = _normalize_string_list(source.get('relationTags') or merged.get('relationTags'))
    merged['layoutPriority'] = _to_float(source.get('layoutPriority'), _to_float(merged.get('layoutPriority'), 0.0))
    merged['position'] = _as_dict(source.get('position')) or _as_dict(target.get('position')) or merged.get('position', {})
    merged['size'] = _as_dict(source.get('size')) or _as_dict(target.get('size')) or merged.get('size', {})
    merged['rotation'] = _as_dict(source.get('rotation')) or _as_dict(target.get('rotation')) or merged.get('rotation', {})
    merged['scale'] = _as_dict(source.get('scale')) or _as_dict(target.get('scale')) or merged.get('scale', {'x': 1.0, 'y': 1.0, 'z': 1.0})
    if str(merged.get('keyElementType') or '').strip().lower() == 'wall':
        role = _resolve_wall_role(merged)
        merged['rotation'] = {'yaw': _wall_role_yaw(role), 'pitch': 0.0, 'roll': 0.0}
    return merged


def _canonicalize_shell(items: List[Dict[str, Any]], shell: Dict[str, Any], *, open_wall_role: str = '') -> List[Dict[str, Any]]:
    floors = [item for item in items if _is_floor_like(item)]
    ceilings = [item for item in items if _is_ceiling_like(item)]
    walls = [item for item in items if _is_wall_like(item)]
    regular_items = [item for item in items if _semantic_structure_kind(item) == '']

    shell_items: List[Dict[str, Any]] = []

    floor_template = _build_shell_surface('floor', shell)
    if floors:
        shell_items.append(_merge_shell_item(floor_template, _largest_by_area(floors) or floor_template))
    else:
        shell_items.append(floor_template)

    ceiling_template = _build_shell_surface('ceiling', shell)
    if ceilings:
        shell_items.append(_merge_shell_item(ceiling_template, _largest_by_area(ceilings) or ceiling_template))
    else:
        shell_items.append(ceiling_template)

    wall_by_role: Dict[str, Dict[str, Any]] = {}
    for wall in walls:
        role = _resolve_wall_role(wall)
        current = wall_by_role.get(role)
        if current is None:
            wall_by_role[role] = wall
            continue
        current_area = _effective_size(current)['width'] * _effective_size(current)['height']
        next_area = _effective_size(wall)['width'] * _effective_size(wall)['height']
        if next_area > current_area:
            wall_by_role[role] = wall

    for role in ('left', 'right', 'front', 'back'):
        if open_wall_role and role == open_wall_role:
            continue
        template = _build_shell_surface('wall', shell, role=role)
        explicit = wall_by_role.get(role)
        shell_items.append(_merge_shell_item(template, explicit or template))

    return regular_items + shell_items


def _snap_attached_to_wall(item: Dict[str, Any], parent: Dict[str, Any]) -> None:
    position = _as_dict(item.get('position'))
    parent_position = _as_dict(parent.get('position'))
    parent_size = _effective_size(parent)
    role = _resolve_wall_role(parent)
    rotation = _as_dict(item.get('rotation'))
    rotation['yaw'] = _wall_role_yaw(role)
    rotation['pitch'] = 0.0
    rotation['roll'] = 0.0
    item['rotation'] = rotation
    child_size = _effective_size(item)
    child_half_x, child_half_z = _half_extents_xz(item)
    mount_type = str(item.get('mountType') or '').strip().lower()
    embedded = mount_type == 'embedded-wall' or 'embedded' in _normalize_string_list(item.get('relationTags'))
    if role in ('front', 'back'):
        max_x = max(0.0, parent_size['width'] * 0.5 - child_half_x)
        dx = _clamp(_to_float(position.get('x'), 0.0) - _to_float(parent_position.get('x'), 0.0), -max_x, max_x)
        normal = 1.0 if role == 'front' else -1.0
        position['x'] = _to_float(parent_position.get('x'), 0.0) + dx
        inset = max(0.005, min(parent_size['depth'] * (0.88 if embedded else 0.35), child_size['depth'] * (0.85 if embedded else 0.22)))
        position['z'] = _to_float(parent_position.get('z'), 0.0) + normal * (parent_size['depth'] * 0.5 + child_half_z - inset)
    else:
        max_z = max(0.0, parent_size['width'] * 0.5 - child_half_z)
        dz = _clamp(_to_float(position.get('z'), 0.0) - _to_float(parent_position.get('z'), 0.0), -max_z, max_z)
        normal = 1.0 if role == 'left' else -1.0
        position['z'] = _to_float(parent_position.get('z'), 0.0) + dz
        inset = max(0.005, min(parent_size['depth'] * (0.88 if embedded else 0.35), child_size['depth'] * (0.85 if embedded else 0.22)))
        position['x'] = _to_float(parent_position.get('x'), 0.0) + normal * (parent_size['depth'] * 0.5 + child_half_x - inset)
    max_y = max(0.0, _to_float(parent_position.get('y'), 0.0) + parent_size['height'] - child_size['height'])
    position['y'] = _clamp(_to_float(position.get('y'), 0.0), 0.0, max_y)
    item['position'] = position


def _should_touch_ground(item: Dict[str, Any]) -> bool:
    explicit = item.get('shouldTouchGround')
    if isinstance(explicit, bool):
        return explicit
    placement = str(item.get('placement') or '').strip().lower()
    mount_type = str(item.get('mountType') or '').strip().lower()
    support_surface = str(item.get('supportSurface') or '').strip().lower()
    category = str(item.get('category') or '').strip().lower()
    sub_category = str(item.get('subCategory') or '').strip().lower()
    name = str(item.get('name') or '').strip().lower()
    semantic_role = str(item.get('semanticRole') or '').strip().lower()
    key_element_type = str(item.get('keyElementType') or '').strip().lower()
    tokens = f'{category} {sub_category} {name} {semantic_role} {key_element_type}'
    if placement == 'on-top' or mount_type == 'support-top':
        return False
    if placement == 'attached-to-ceiling' or support_surface == 'ceiling' or mount_type == 'ceiling':
        return False
    if placement == 'on-floor' or support_surface == 'floor' or mount_type == 'floor':
        return True
    if any(word in tokens for word in ['bookshelf', 'bookcase', 'wardrobe', 'closet', 'cabinet', 'display-case', 'display cabinet', 'console', 'locker', 'shelf', '书柜', '书架', '衣柜', '展示柜', '柜', '控制台']):
        return True
    if any(word in tokens for word in ['monitor', 'screen', 'painting', 'poster', 'wall-light', 'sconce', 'mirror', '显示屏', '屏幕', '挂画', '壁灯', '镜子']):
        return False
    return bool(_to_float((_as_dict(item.get('position'))).get('y'), 0.0) <= 0.08)


def _snap_on_top(item: Dict[str, Any], parent: Dict[str, Any]) -> None:
    position = _as_dict(item.get('position'))
    parent_position = _as_dict(parent.get('position'))
    parent_size = _effective_size(parent)
    child_size = _effective_size(item)
    inset_x = max(0.01, min(parent_size['width'] * 0.04, 0.08))
    inset_z = max(0.01, min(parent_size['depth'] * 0.04, 0.08))
    usable_dx = max(0.0, (parent_size['width'] - child_size['width']) * 0.5 - inset_x)
    usable_dz = max(0.0, (parent_size['depth'] - child_size['depth']) * 0.5 - inset_z)
    dx = _clamp(_to_float(position.get('x'), 0.0) - _to_float(parent_position.get('x'), 0.0), -usable_dx, usable_dx)
    dz = _clamp(_to_float(position.get('z'), 0.0) - _to_float(parent_position.get('z'), 0.0), -usable_dz, usable_dz)
    position['x'] = _to_float(parent_position.get('x'), 0.0) + dx
    position['z'] = _to_float(parent_position.get('z'), 0.0) + dz
    position['y'] = _top_y(parent) + max(0.01, min(0.04, child_size['height'] * 0.04))
    item['position'] = position


def _should_embed_inside_parent(item: Dict[str, Any], parent: Dict[str, Any]) -> bool:
    placement = str(item.get('placement') or '').strip().lower()
    support_surface = str(item.get('supportSurface') or '').strip().lower()
    ground_reason = str(item.get('groundReason') or '').strip().lower()
    name = str(item.get('name') or '').strip().lower()
    category = str(item.get('category') or '').strip().lower()
    sub_category = str(item.get('subCategory') or '').strip().lower()
    parent_name = str(parent.get('name') or '').strip().lower()
    parent_sub_category = str(parent.get('subCategory') or '').strip().lower()
    parent_mount_type = str(parent.get('mountType') or '').strip().lower()
    tokens = ' '.join([ground_reason, support_surface, name, category, sub_category])
    parent_tokens = ' '.join([parent_name, parent_sub_category, parent_mount_type])
    if placement == 'embedded-inside':
        return True
    if 'interior' in support_surface or 'inside' in support_surface:
        return True
    if _text_match(tokens, ['柜内', '展示柜内', '书柜内', '内部', 'inside', 'interior']):
        return True
    if _text_match(parent_tokens, ['display-cabinet', 'display cabinet', '展示柜']) and _text_match(tokens, ['armor', '盔甲', '展示', 'mannequin']):
        return True
    return False


def _snap_embedded_inside(item: Dict[str, Any], parent: Dict[str, Any]) -> None:
    position = _as_dict(item.get('position'))
    parent_position = _as_dict(parent.get('position'))
    parent_size = _effective_size(parent)
    child_size = _effective_size(item)
    parent_wall_role = _canonical_wall_role(parent.get('wallRole'))
    max_dx = max(0.0, (parent_size['width'] - child_size['width']) * 0.5 - 0.04)
    max_dy = max(0.0, parent_size['height'] - child_size['height'] - 0.05)
    dx = _clamp(_to_float(position.get('x'), 0.0) - _to_float(parent_position.get('x'), 0.0), -max_dx, max_dx)
    dy = _clamp(_to_float(position.get('y'), 0.0), 0.0, max_dy)
    position['y'] = dy
    rotation = _as_dict(item.get('rotation'))
    rotation['pitch'] = 0.0
    rotation['roll'] = 0.0

    if parent_wall_role in ('left', 'right'):
        max_z = max(0.0, (parent_size['width'] - child_size['depth']) * 0.5 - 0.04)
        dz = _clamp(_to_float(position.get('z'), 0.0) - _to_float(parent_position.get('z'), 0.0), -max_z, max_z)
        room_normal = 1.0 if parent_wall_role == 'left' else -1.0
        child_half_x = child_size['width'] * 0.5
        position['z'] = _to_float(parent_position.get('z'), 0.0) + dz
        position['x'] = _to_float(parent_position.get('x'), 0.0) + room_normal * max(0.0, parent_size['depth'] * 0.5 - child_half_x * 0.35)
        rotation['yaw'] = 90.0 if parent_wall_role == 'left' else 270.0
    else:
        max_x = max(0.0, (parent_size['width'] - child_size['width']) * 0.5 - 0.04)
        dx = _clamp(_to_float(position.get('x'), 0.0) - _to_float(parent_position.get('x'), 0.0), -max_x, max_x)
        room_normal = 1.0 if parent_wall_role == 'back' else -1.0
        child_half_z = child_size['depth'] * 0.5
        position['x'] = _to_float(parent_position.get('x'), 0.0) + dx
        position['z'] = _to_float(parent_position.get('z'), 0.0) + room_normal * max(0.0, parent_size['depth'] * 0.5 - child_half_z * 0.35)
        rotation['yaw'] = 0.0 if parent_wall_role == 'back' else 180.0

    existing_support_surface = str(item.get('supportSurface') or '').strip().lower()
    item['placement'] = 'embedded-inside'
    item['supportSurface'] = existing_support_surface if existing_support_surface.startswith('interior-') else 'interior-front'
    item['anchor'] = str(item.get('anchor') or 'center')
    item['rotation'] = rotation
    item['position'] = position


def _snap_attached_to_ceiling(item: Dict[str, Any], parent: Dict[str, Any]) -> None:
    position = _as_dict(item.get('position'))
    parent_position = _as_dict(parent.get('position'))
    parent_size = _effective_size(parent)
    child_size = _effective_size(item)
    max_dx = max(0.0, (parent_size['width'] - child_size['width']) * 0.5)
    max_dz = max(0.0, (parent_size['depth'] - child_size['depth']) * 0.5)
    dx = _clamp(_to_float(position.get('x'), 0.0) - _to_float(parent_position.get('x'), 0.0), -max_dx, max_dx)
    dz = _clamp(_to_float(position.get('z'), 0.0) - _to_float(parent_position.get('z'), 0.0), -max_dz, max_dz)
    position['x'] = _to_float(parent_position.get('x'), 0.0) + dx
    position['z'] = _to_float(parent_position.get('z'), 0.0) + dz
    position['y'] = max(0.0, _to_float(parent_position.get('y'), 0.0) - child_size['height'])
    rotation = _as_dict(item.get('rotation'))
    rotation['pitch'] = 0.0
    rotation['roll'] = 0.0
    item['rotation'] = rotation
    item['position'] = position


def _apply_explicit_relationships(items: List[Dict[str, Any]], shell: Dict[str, Any]) -> List[Dict[str, Any]]:
    items_by_id = {str(item.get('id') or ''): item for item in items}
    shell_walls = {
        _resolve_wall_role(item): item
        for item in items
        if _is_wall_like(item)
    }
    ceiling_item = next((item for item in items if _is_ceiling_like(item)), None)
    floor_item = next((item for item in items if _is_floor_like(item)), None)
    center_x = _to_float(shell.get('centerX'), 0.0)
    center_z = _to_float(shell.get('centerZ'), 0.0)
    width = max(1.5, _to_float(shell.get('width'), 4.0))
    depth = max(1.5, _to_float(shell.get('depth'), 4.0))
    min_x = center_x - width * 0.5
    max_x = center_x + width * 0.5
    min_z = center_z - depth * 0.5
    max_z = center_z + depth * 0.5

    for item in items:
        if _semantic_structure_kind(item) in ('floor', 'wall', 'ceiling'):
            continue

        position = _as_dict(item.get('position'))
        parent_id = str(item.get('parentId') or '').strip()
        placement = str(item.get('placement') or '').strip().lower()
        support_surface = str(item.get('supportSurface') or '').strip().lower()
        wall_role = _canonical_wall_role(item.get('wallRole'))
        mount_type = str(item.get('mountType') or '').strip().lower()
        parent = items_by_id.get(parent_id)

        if parent is None and parent_id in ('ceiling', 'ceiling_main', 'auto-ceiling-shell'):
            parent = ceiling_item
            if parent is not None:
                item['parentId'] = str(parent.get('id') or '')
        if parent is None and parent_id in ('floor', 'floor_main', 'auto-floor-shell'):
            parent = floor_item
            if parent is not None:
                item['parentId'] = str(parent.get('id') or '')

        if parent is None and placement == 'attached-to-wall' and wall_role:
            parent = shell_walls.get(wall_role)
            if parent is not None:
                item['parentId'] = str(parent.get('id') or '')

        if parent is not None:
            parent_kind = _semantic_structure_kind(parent)
            wall_attached = placement in ('attached-to-wall', 'embedded-wall') or mount_type in ('embedded-wall', 'wall')
            ceiling_attached = placement == 'attached-to-ceiling' or support_surface == 'ceiling' or mount_type == 'ceiling' or parent_kind == 'ceiling'
            embedded_inside = _should_embed_inside_parent(item, parent)
            if not placement:
                placement = 'attached-to-wall' if parent_kind == 'wall' else ('attached-to-ceiling' if parent_kind == 'ceiling' else 'on-top')
                item['placement'] = placement
            if wall_attached and parent_kind == 'wall':
                item['supportSurface'] = support_surface or str(parent.get('wallRole') or 'wall')
                item['anchor'] = str(item.get('anchor') or 'center')
                _snap_attached_to_wall(item, parent)
                if _should_touch_ground(item):
                    position = _as_dict(item.get('position'))
                    position['y'] = 0.0
                    item['position'] = position
            elif ceiling_attached and parent_kind == 'ceiling':
                item['placement'] = 'attached-to-ceiling'
                item['supportSurface'] = 'ceiling'
                item['anchor'] = str(item.get('anchor') or 'center')
                _snap_attached_to_ceiling(item, parent)
            elif embedded_inside:
                _snap_embedded_inside(item, parent)
            elif placement == 'on-top':
                item['supportSurface'] = support_surface or 'top'
                item['anchor'] = str(item.get('anchor') or 'center')
                _snap_on_top(item, parent)
            elif placement == 'attached-to-ceiling' or support_surface == 'ceiling':
                position['y'] = max(0.0, _to_float(shell.get('height'), 2.8) - _effective_size(item)['height'])
                item['placement'] = 'attached-to-ceiling'
                item['supportSurface'] = 'ceiling'
                item['anchor'] = str(item.get('anchor') or 'center')
                item['position'] = position
        else:
            if placement == 'on-floor' or _should_touch_ground(item) or (not placement and _to_float(position.get('y'), 0.0) <= 0.08):
                position['y'] = 0.0
                item['placement'] = 'on-floor' if placement != 'attached-to-wall' else 'attached-to-wall'
                item['supportSurface'] = support_surface or 'floor'
                item['anchor'] = str(item.get('anchor') or 'center')
                item['position'] = position
            elif placement == 'attached-to-ceiling' or support_surface == 'ceiling':
                position['y'] = max(0.0, _to_float(shell.get('height'), 2.8) - _effective_size(item)['height'])
                item['placement'] = 'attached-to-ceiling'
                item['supportSurface'] = 'ceiling'
                item['anchor'] = str(item.get('anchor') or 'center')
                item['position'] = position

        position = _as_dict(item.get('position'))
        child_half_x, child_half_z = _half_extents_xz(item)
        position['x'] = _clamp(_to_float(position.get('x'), 0.0), min_x + child_half_x, max_x - child_half_x)
        position['z'] = _clamp(_to_float(position.get('z'), 0.0), min_z + child_half_z, max_z - child_half_z)
        item['position'] = position

    return items


def build_scene_layout_from_json(payload: Any, *, node_id: str = '') -> Dict[str, Any]:
    data = payload if isinstance(payload, dict) else {}
    key_element_index = _normalize_key_elements(data)
    raw_objects = None
    for key in ('objects', 'items', 'elements'):
        candidate = data.get(key)
        if isinstance(candidate, list):
            raw_objects = candidate
            break
    if raw_objects is None:
        raw_objects = []

    layout_items: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_objects):
        if not isinstance(item, dict):
            continue
        normalized_item = _normalize_object(item, index)
        summary = key_element_index.get(str(normalized_item.get('id') or ''))
        if summary:
            normalized_item.update(summary)
        normalized_item = _apply_key_element_semantics(normalized_item)
        layout_items.append(normalized_item)

    layout_items = _normalize_non_structure_items(layout_items)
    room_shell = _derive_room_shell(data, layout_items)
    open_wall_role = _resolve_open_wall_role(data)
    layout_items = _canonicalize_shell(layout_items, room_shell, open_wall_role=open_wall_role)
    layout_items = _apply_group_colors(layout_items)
    layout_items = _apply_explicit_relationships(layout_items, room_shell)

    if not layout_items:
        fallback_shell = _derive_room_shell({}, [])
        layout_items = _apply_group_colors(_canonicalize_shell([], fallback_shell, open_wall_role=open_wall_role))
        room_shell = fallback_shell

    shell_center_x = _to_float(room_shell.get('centerX'), 0.0)
    shell_center_z = _to_float(room_shell.get('centerZ'), 0.0)
    shell_width = max(1.5, _to_float(room_shell.get('width'), 4.0))
    shell_depth = max(1.5, _to_float(room_shell.get('depth'), 4.0))
    shell_height = max(2.4, _to_float(room_shell.get('height'), 2.8))
    camera_distance = max(shell_width, shell_depth) * 1.35 + 1.8

    return {
        'ok': True,
        'layoutItems': layout_items,
        'camera': {
            'position': {'x': shell_center_x + camera_distance, 'y': shell_height * 1.1 + 1.0, 'z': shell_center_z + camera_distance},
            'target': {'x': shell_center_x, 'y': min(shell_height * 0.45, 1.8), 'z': shell_center_z},
        },
        'message': f'基于输入 JSON 生成 {len(layout_items)} 个 3D 占位块，并优先围合房间壳体。',
        'nodeId': node_id,
    }
