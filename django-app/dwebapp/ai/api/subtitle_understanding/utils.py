"""Utility functions for subtitle understanding APIs.

Extracted from subtitle_understanding_api.py to keep the view module smaller.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _extract_first_json_object(text: str) -> str:
    s = text.strip()
    if not s:
        return ""
    # Fast path: whole string is JSON
    if s.startswith("{") and s.endswith("}"):
        return s

    start = s.find("{")
    if start < 0:
        return ""

    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue

        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            depth += 1
            continue
        if ch == "}":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
            continue

    return ""


def _try_parse_json(text: str) -> Any:
    import json

    raw = text.strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        sub = _extract_first_json_object(raw)
        if not sub:
            return None
        try:
            return json.loads(sub)
        except Exception:
            return None


def _is_record(v: Any) -> bool:
    return isinstance(v, dict)


def _to_safe_str(v: Any) -> str:
    return str(v) if isinstance(v, str) else ""


def _extract_top_bigrams(texts: List[str], *, limit: int = 6) -> List[str]:
    """Extract frequent 2-char tokens from subtitle texts.

    This is a lightweight, dependency-free fallback to get "topics" without
    copying original subtitle sentences.
    """

    from collections import Counter
    import re

    cnt: Counter[str] = Counter()
    for t in texts:
        if not isinstance(t, str):
            continue
        s = t.strip()
        if not s:
            continue
        # keep CJK + letters; remove punctuation/whitespace
        s = re.sub(r"\s+", "", s)
        s = re.sub(r"[^\u4e00-\u9fffA-Za-z]", "", s)
        if len(s) < 2:
            continue
        for i in range(len(s) - 1):
            bg = s[i : i + 2]
            if len(bg) != 2:
                continue
            # drop boring tokens
            if bg.isalpha() and bg.lower() in ("th", "he", "in", "to", "of"):
                continue
            cnt[bg] += 1

    out: List[str] = []
    for k, _v in cnt.most_common(limit * 3):
        if len(out) >= limit:
            break
        if k in out:
            continue
        out.append(k)
    return out


def _repair_component_template(t: Any, fallback_id: str) -> Dict[str, Any]:
    out: Dict[str, Any] = dict(t) if isinstance(t, dict) else {}
    if out.get("schemaVersion") != 1:
        out["schemaVersion"] = 1
    tid = out.get("templateId")
    if not isinstance(tid, str) or not tid.strip():
        out["templateId"] = fallback_id
    name = out.get("name")
    if not isinstance(name, str) or not name.strip():
        out["name"] = out["templateId"]

    # params
    raw_params = out.get("params")
    params: List[Dict[str, Any]] = []
    if isinstance(raw_params, list):
        for i, p in enumerate(raw_params):
            if not isinstance(p, dict):
                continue
            key = p.get("key")
            if not isinstance(key, str) or not key.strip():
                p = {**p, "key": f"param_{i + 1}"}
            params.append(p)
    out["params"] = params

    def _ensure_param(key: str) -> None:
        k = str(key or "").strip()
        if not k:
            return
        for p in params:
            if isinstance(p, dict) and str(p.get("key") or "").strip() == k:
                t0 = p.get("type")
                if not isinstance(t0, str) or t0.strip() not in (
                    "string",
                    "number",
                    "boolean",
                    "color",
                    "asset:image",
                ):
                    p["type"] = "string"
                return
        params.append({"key": k, "type": "string"})

    def _infer_text_key(local_id: str) -> str:
        lid = (local_id or "").strip().lower()
        if "title" in lid:
            return "title"
        if "sub" in lid:
            return "subtitle"
        if "body" in lid or "desc" in lid or "summary" in lid or "content" in lid:
            return "body"
        return "text"

    # nodes
    raw_nodes = out.get("nodes")
    nodes: List[Dict[str, Any]] = []
    if isinstance(raw_nodes, list):
        for i, n in enumerate(raw_nodes):
            if not isinstance(n, dict):
                continue
            nn = dict(n)
            if not isinstance(nn.get("props"), dict):
                nn["props"] = {}
            if "transform" in nn and not isinstance(nn.get("transform"), dict):
                nn["transform"] = {}
            lid = nn.get("localId")
            if not isinstance(lid, str) or not lid.strip():
                nn["localId"] = f"n_{i}"

            # Enforce template placeholders: no concrete text values.
            try:
                t0 = nn.get("type")
                if isinstance(t0, str) and t0.strip() == "text":
                    props = nn.get("props")
                    if not isinstance(props, dict):
                        props = {}
                    local_id = str(nn.get("localId") or "")
                    key = _infer_text_key(local_id)
                    placeholder = f"{{{{{key}}}}}"
                    tc = props.get("textContent")
                    txt = props.get("text")
                    if isinstance(tc, str):
                        if "{{" not in tc or "}}" not in tc:
                            props["textContent"] = placeholder
                    elif isinstance(txt, str):
                        if "{{" not in txt or "}}" not in txt:
                            props["textContent"] = placeholder
                    else:
                        props["textContent"] = placeholder
                    nn["props"] = props
                    _ensure_param(key)
            except Exception:
                pass
            nodes.append(nn)
    out["nodes"] = nodes

    # Normalize localId uniqueness and enforce rootLocalId='root'.
    try:
        out["rootLocalId"] = "root"

        used: Dict[str, int] = {}
        remap: Dict[str, str] = {}
        for idx, n in enumerate(out.get("nodes") or []):
            if not isinstance(n, dict):
                continue
            old = str(n.get("localId") or "").strip() or f"n_{idx}"
            base = old
            c = used.get(base, 0)
            if c == 0:
                used[base] = 1
                n["localId"] = base
                continue
            new_id = f"{base}_{c}"
            used[base] = c + 1
            remap[old] = new_id
            n["localId"] = new_id

        if remap:
            for n in out.get("nodes") or []:
                if not isinstance(n, dict):
                    continue
                pid = n.get("parentLocalId")
                if isinstance(pid, str) and pid in remap:
                    n["parentLocalId"] = remap[pid]
    except Exception:
        pass

    out["rootLocalId"] = "root"

    # Ensure nodes is non-empty and root exists.
    if not out.get("nodes"):
        out["nodes"] = [
            {
                "localId": "root",
                "type": "rect",
                "props": {},
                "transform": {"width": 800, "height": 300},
            }
        ]

    nodes2: List[Dict[str, Any]] = [n for n in (out.get("nodes") or []) if isinstance(n, dict)]
    root_node: Optional[Dict[str, Any]] = None
    for n in nodes2:
        if str(n.get("localId") or "").strip() == "root":
            root_node = n
            break
    if root_node is None:
        root_node = {"localId": "root", "type": "rect", "props": {}, "transform": {"width": 800, "height": 300}}
        out["nodes"] = [root_node, *nodes2]
        nodes2 = [root_node, *nodes2]

    try:
        root_node["type"] = "rect"
        if "parentLocalId" in root_node:
            root_node.pop("parentLocalId", None)
        tr_val: Any = root_node.get("transform")
        tr: Dict[str, Any] = tr_val if isinstance(tr_val, dict) else {}
        if not isinstance(tr.get("width"), (int, float)) or (tr.get("width") or 0) <= 0:
            tr["width"] = 800
        if not isinstance(tr.get("height"), (int, float)) or (tr.get("height") or 0) <= 0:
            tr["height"] = 300
        root_node["transform"] = tr
    except Exception:
        pass

    # Enforce unique top-level: every non-root must have parentLocalId; default to root.
    try:
        ids = {str(n.get("localId") or "").strip() for n in nodes2}
        for n in nodes2:
            lid = str(n.get("localId") or "").strip()
            if lid == "root":
                continue
            pid = n.get("parentLocalId")
            pid_s = str(pid or "").strip() if isinstance(pid, str) else ""
            if not pid_s or pid_s == lid or pid_s not in ids:
                n["parentLocalId"] = "root"
    except Exception:
        pass

    return out


def _validate_unique_root(template: Dict[str, Any]) -> tuple[bool, str]:
    """Validate that ComponentTemplate has exactly one top-level root node."""

    nodes_val: Any = template.get("nodes")
    nodes: List[Any] = nodes_val if isinstance(nodes_val, list) else []
    rid = str(template.get("rootLocalId") or "").strip()
    if rid != "root":
        return False, "rootLocalId 必须为 'root'"

    root_count = 0
    top_level: List[str] = []
    ids: set[str] = set()
    for n in nodes:
        if not isinstance(n, dict):
            continue
        lid = str(n.get("localId") or "").strip()
        if not lid:
            continue
        ids.add(lid)
        pid = n.get("parentLocalId")
        pid_s = str(pid or "").strip() if isinstance(pid, str) else ""
        if lid == "root":
            root_count += 1
        if (not pid_s) and lid != "root":
            top_level.append(lid)

    if root_count != 1:
        return False, f"localId='root' 的节点必须且只能有 1 个（当前 {root_count}）"
    if top_level:
        return False, f"发现非 root 的顶层节点（缺少 parentLocalId）：{top_level[:5]}"

    for n in nodes:
        if not isinstance(n, dict):
            continue
        lid = str(n.get("localId") or "").strip()
        if not lid or lid == "root":
            continue
        pid = n.get("parentLocalId")
        pid_s = str(pid or "").strip() if isinstance(pid, str) else ""
        if not pid_s or pid_s not in ids:
            return False, f"节点 {lid} 的 parentLocalId 无效"
    return True, "ok"


def _normalize_glow_filters(template: Dict[str, Any]) -> None:
    """Normalize glow filter intensity based on blurX/blurY."""

    nodes_val: Any = template.get("nodes")
    nodes: List[Any] = nodes_val if isinstance(nodes_val, list) else []

    def num(v: Any) -> float | None:
        return float(v) if isinstance(v, (int, float)) and v == v else None

    base_blur = 10.0
    base_intensity = 1.6
    max_blur = 10.0
    max_intensity = 2.0

    for n in nodes:
        if not isinstance(n, dict):
            continue
        props = n.get("props")
        if not isinstance(props, dict):
            continue
        flt = props.get("filters")
        if not isinstance(flt, list):
            continue
        for f in flt:
            if not isinstance(f, dict):
                continue
            t = str(f.get("type") or "").strip().lower()
            if t != "glow":
                continue

            bx = num(f.get("blurX"))
            by = num(f.get("blurY"))
            if bx is None and by is None:
                bx = by = base_blur
                f["blurX"] = bx
                f["blurY"] = by
            if bx is None:
                bx = float(by or base_blur)
                f["blurX"] = bx
            if by is None:
                by = float(bx or base_blur)
                f["blurY"] = by

            bx = max(0.0, min(float(bx), max_blur))
            by = max(0.0, min(float(by), max_blur))
            f["blurX"] = bx
            f["blurY"] = by

            blur = max(0.0, float(bx), float(by))
            target = base_intensity * (blur / base_blur if base_blur > 0 else 1.0)
            target = max(1.0, target)
            target = min(max_intensity, target)
            f["intensity"] = target


def _collect_palette_colors(prompt_input: Any) -> Dict[str, str]:
    """Extract a palette dict from promptInput."""

    def _norm_hex(v: Any) -> str:
        s = str(v or "").strip()
        if len(s) == 7 and s.startswith("#"):
            h = s[1:]
            if all(c in "0123456789abcdefABCDEF" for c in h):
                return "#" + h.lower()
        return ""

    out: Dict[str, str] = {}
    if not isinstance(prompt_input, dict):
        return out

    pal = prompt_input.get("palette")
    if isinstance(pal, dict):
        for k, v in pal.items():
            kk = str(k or "").strip()
            hv = _norm_hex(v)
            if kk and hv:
                out[kk] = hv
        return out

    entries = prompt_input.get("paletteEntries")
    if entries is None:
        entries = pal

    if isinstance(entries, list):
        for item in entries:
            if not isinstance(item, dict):
                continue
            kk = str(item.get("key") or "").strip()
            hv = _norm_hex(item.get("value") or item.get("color"))
            if kk and hv:
                out[kk] = hv
    return out


def _enforce_palette_whitelist(template: Dict[str, Any], palette: Dict[str, str]) -> None:
    if not palette:
        return
    allowed = set(palette.values())

    def pick_fallback(prop_key: str) -> str:
        k = str(prop_key or "").lower()
        for cand in ("background", "text", "primary", "accent", "neutral", "secondary"):
            if cand in palette:
                if cand == "background" and ("bg" in k or "background" in k):
                    return palette[cand]
                if cand == "text" and ("text" in k or "font" in k):
                    return palette[cand]
        return palette.get("primary") or palette.get("accent") or next(iter(allowed))

    def walk(obj: Any, key_ctx: str = "") -> Any:
        if isinstance(obj, dict):
            for kk, vv in list(obj.items()):
                obj[kk] = walk(vv, str(kk))
            return obj
        if isinstance(obj, list):
            for i in range(len(obj)):
                obj[i] = walk(obj[i], key_ctx)
            return obj
        if isinstance(obj, str):
            s = obj.strip()
            if len(s) == 7 and s.startswith("#"):
                h = s[1:]
                if all(c in "0123456789abcdefABCDEF" for c in h):
                    hs = "#" + h.lower()
                    if hs in allowed:
                        return hs
                    return pick_fallback(key_ctx)
            return obj
        return obj

    walk(template)


def _ensure_glow_filter(template: Dict[str, Any], palette: Dict[str, str]) -> None:
    nodes_val: Any = template.get("nodes")
    nodes: List[Any] = nodes_val if isinstance(nodes_val, list) else []

    def has_glow_or_blur() -> bool:
        for n in nodes:
            if not isinstance(n, dict):
                continue
            props = n.get("props")
            if not isinstance(props, dict):
                continue
            flt = props.get("filters")
            if not isinstance(flt, list):
                continue
            for f in flt:
                if not isinstance(f, dict):
                    continue
                t = str(f.get("type") or "").strip().lower()
                if t in ("glow", "blur"):
                    return True
        return False

    if has_glow_or_blur():
        return

    color = palette.get("accent") or palette.get("primary") or (next(iter(palette.values())) if palette else "#00ffff")
    glow = {
        "type": "glow",
        "color": color,
        "intensity": 1.6,
        "blurX": 10,
        "blurY": 10,
        "inner": False,
        "knockout": False,
    }

    target: Optional[Dict[str, Any]] = None
    root_id = str(template.get("rootLocalId") or "root").strip() or "root"
    for n in nodes:
        if not isinstance(n, dict):
            continue
        if str(n.get("localId") or "").strip() == root_id:
            continue
        t = str(n.get("type") or "").strip().lower()
        if t in ("line", "text", "rect"):
            target = n
            break
    if target is None:
        for n in nodes:
            if isinstance(n, dict) and str(n.get("localId") or "").strip() == root_id:
                target = n
                break
    if target is None:
        return

    props = target.get("props")
    if not isinstance(props, dict):
        props = {}
    flt = props.get("filters")
    if not isinstance(flt, list):
        flt = []
    flt.append(glow)
    props["filters"] = flt
    target["props"] = props
