import { EventEmitter } from 'events'
import net from 'net'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn, execFile } from 'child_process'
import { BrowserWindow, shell } from 'electron'
import logger from '../../core/logger.mjs'
import { getToolExecutor } from '../mcp/toolExecutor.mjs'
import { getProjectRootSnapshot } from '../../projectAssetProtocol.mjs'
import { getBlenderWorkspace } from './workspace.mjs'

const BLENDER_TOOL_PREFIX = 'blender_'
const BLENDER_STATUS_CHANGED_CHANNEL = 'dweb:blender:mcp:status-changed'
const DEFAULT_HOST = 'localhost'
const DEFAULT_PORT = 9876
const SOCKET_TIMEOUT_MS = 180000
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024
const IMAGE_SIZE_LIMIT = 250 * 1024
const IMAGE_MAX_WIDTH = 960

function broadcastStatusToWindows(payload) {
	try {
		for (const win of BrowserWindow.getAllWindows()) {
			try {
				if (!win.isDestroyed()) win.webContents.send(BLENDER_STATUS_CHANGED_CHANNEL, payload)
			} catch {
				/* window may be closing */
			}
		}
	} catch (err) {
		logger.debug(`[BlenderMcpService] Failed to broadcast status: ${err.message}`)
	}
}

function escStr(s) {
	return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const IMAGE_DOWNSCALE_CODE = `
def _downscale_image(tmpdir, filepath, size_limit, max_width, tolerance=0):
    import os, imbuf, math
    from bpy import context
    
    filepath_out = os.path.join(tmpdir, "downscaled.png")
    
    def _write_read(im_buf):
        imbuf.write(im_buf, filepath=filepath_out)
        with open(filepath_out, "rb") as fh:
            return fh.read()
    
    im = imbuf.load(filepath)
    pixel_size = context.preferences.system.pixel_size
    if pixel_size > 1.0:
        w, h = im.size
        im.resize((round(w / pixel_size), round(h / pixel_size)), method='BILINEAR')
    
    w, h = im.size
    if w > max_width:
        scale = max_width / w
        new_w = max(64, round(w * scale))
        new_h = max(64, round(h * scale))
        im.resize((new_w, new_h), method='BILINEAR')
    
    data = _write_read(im)
    if len(data) <= size_limit:
        im.free()
        return data
    
    cur_w, cur_h = im.size
    for attempt in range(10):
        scale_factor = math.sqrt(size_limit / len(data)) * 0.85
        new_w = max(64, round(cur_w * scale_factor))
        new_h = max(64, round(cur_h * scale_factor))
        if new_w >= cur_w and new_h >= cur_h:
            new_w = max(64, round(cur_w * 0.7))
            new_h = max(64, round(cur_h * 0.7))
        im.resize((new_w, new_h), method='BILINEAR')
        data = _write_read(im)
        cur_w, cur_h = new_w, cur_h
        if len(data) <= size_limit:
            break
    
    im.free()
    return data
`

function buildGetObjectsSummary() {
	return `import bpy

def _walk_collection_tree(coll, visited, depth=0):
    if coll.name in visited:
        return None
    visited.add(coll.name)
    info = {
        "name": coll.name,
    }
    if depth > 0:
        info["depth"] = depth
    obj_names = [obj.name for obj in coll.objects]
    if obj_names:
        info["objects"] = obj_names
    children = []
    for child in coll.children:
        if child.name not in visited:
            child_info = _walk_collection_tree(child, visited, depth + 1)
            if child_info:
                children.append(child_info)
    if children:
        info["children"] = children
    return info

scene = bpy.context.scene
view_layer = bpy.context.view_layer

all_objects = []
for obj in scene.objects:
    obj_info = {
        "name": obj.name,
    }
    if obj.type != 'MESH':
        obj_info["type"] = obj.type
    loc = list(obj.location)
    if loc != [0.0, 0.0, 0.0]:
        obj_info["location"] = loc
    if not obj.visible_get():
        obj_info["visible"] = False
    if obj.select_get():
        obj_info["selected"] = True
    all_objects.append(obj_info)

collections_tree = []
visited = set()
master = scene.collection
if master:
    root_info = _walk_collection_tree(master, visited, 0)
    if root_info:
        collections_tree = [root_info]

materials = [m.name for m in bpy.data.materials]
cameras = [c.name for c in bpy.data.cameras]
lights_list = [l.name for l in bpy.data.lights]

result = {
    "objects": all_objects,
    "collections": collections_tree,
}
if materials:
    result["materials"] = materials
if cameras:
    result["cameras"] = cameras
if lights_list:
    result["lights"] = lights_list
active = bpy.context.active_object
if active:
    result["active_object"] = active.name
selected = [o.name for o in bpy.context.selected_objects]
if selected:
    result["selected_objects"] = selected
mode = bpy.context.mode
if mode != 'OBJECT':
    result["mode"] = mode
if scene.name != 'Scene':
    result["scene_name"] = scene.name
}`
}

function buildGetObjectDetailSummary(objectName) {
	const n = escStr(objectName)
	return `import bpy

name = "${n}"
obj = bpy.data.objects.get(name)
if obj is None:
    available = sorted(bpy.data.objects.keys())
    result = {
        "status": "error",
        "message": f"Object {name!r} not found. Available objects: {', '.join(available) if available else '(none)'}"
    }
else:
    result = {
        "status": "ok",
        "name": obj.name,
        "type": obj.type,
        "location": list(obj.location),
        "rotation": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "dimensions": list(obj.dimensions),
        "parent": obj.parent.name if obj.parent else None,
        "children": [child.name for child in obj.children],
        "modifiers": [{"name": mod.name, "type": mod.type, "show_viewport": mod.show_viewport, "show_render": mod.show_render} for mod in obj.modifiers],
        "constraints": [{"name": con.name, "type": con.type, "enabled": con.enabled} for con in obj.constraints],
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "visibility": {"hide_viewport": obj.hide_viewport, "hide_render": obj.hide_render, "hide_get": obj.hide_get()},
        "data_name": obj.data.name if obj.data else None,
        "collections": [col.name for col in obj.users_collection],
    }`
}

function buildGetBlendfileSummaryDatablocks() {
	return `import bpy

scene = bpy.context.scene
datablock_counts = {}
for attr_name in dir(bpy.data):
    attr = getattr(bpy.data, attr_name, None)
    if hasattr(attr, '__iter__') and not attr_name.startswith('_'):
        try:
            count = len(list(attr))
            if count > 0:
                datablock_counts[attr_name] = count
        except Exception:
            pass

result = {
    "status": "ok",
    "datablock_counts": datablock_counts,
    "active_workspace": bpy.context.window.workspace.name if bpy.context.window else None,
    "render_engine": scene.render.engine,
    "scene_name": scene.name,
    "blender_version": bpy.app.version_string,
}`
}

function buildGetBlendfileSummaryMissingFiles() {
	return `import bpy, os

missing = []
checked = 0

def _visit(id_data, path, _placeholder):
    global checked
    checked += 1
    filepath = bpy.path.abspath(path)
    if not os.path.exists(filepath):
        missing.append({
            "id_type": type(id_data).__name__,
            "id_name": getattr(id_data, "name", ""),
            "path": filepath,
        })

bpy.data.file_path_foreach(_visit, flags={"SKIP_PACKED", "SKIP_WEAK_REFERENCES", "RESOLVE_TOKEN"})

result = {
    "status": "ok",
    "missing_files": missing,
    "total_checked": checked,
}`
}

function buildGetBlendfileSummaryLinkedLibraries() {
	return `import bpy

direct = []
indirect = []
for lib in bpy.data.libraries:
    info = {"filepath": lib.filepath, "name": lib.name}
    count = 0
    for attr in dir(bpy.data):
        collection = getattr(bpy.data, attr, None)
        if not hasattr(collection, "__iter__"):
            continue
        try:
            for item in collection:
                if hasattr(item, "library") and item.library == lib:
                    count += 1
        except Exception:
            pass
    info["linked_datablocks_count"] = count
    if lib.parent is None:
        direct.append(info)
    else:
        info["parent_library"] = lib.parent.name
        indirect.append(info)

result = {
    "status": "ok",
    "direct_libraries": direct,
    "indirect_libraries": indirect,
    "total_library_count": len(bpy.data.libraries),
}`
}

function buildGetBlendfileSummaryPathInfo() {
	return `import bpy, os, time

_MAX_BACKUPS = 32
filepath = bpy.data.filepath
age = None
size = None
backups = None
if filepath and os.path.exists(filepath):
    stat = os.stat(filepath)
    age = round(time.time() - stat.st_mtime, 1)
    size = stat.st_size
    backups = []
    for i in range(1, _MAX_BACKUPS + 1):
        backup_path = filepath + str(i)
        if not os.path.exists(backup_path):
            break
        bstat = os.stat(backup_path)
        backups.append({
            "path": backup_path,
            "age_seconds": round(time.time() - bstat.st_mtime, 1),
            "size_bytes": bstat.st_size,
        })

result = {
    "status": "ok",
    "filepath": filepath,
    "is_saved": bool(filepath),
    "is_dirty": bpy.data.is_dirty,
    "age_seconds": age,
    "file_size_bytes": size,
    "backups": backups,
}`
}

function buildGetBlendfileSummaryUsageGuess() {
	return `import bpy

data = bpy.data
scene = bpy.context.scene

def _summarize(signals):
    if not signals:
        return (0, 0)
    n = len(signals)
    return (round(100 * sum(c for c, _ in signals) / n), round(100 * sum(k for _, k in signals) / n))

usages = {}

# Animation
signals = [(float(bool(data.actions)), 1.0), (float(bool(data.armatures)), 1.0), (float(any(bool(obj.constraints) for obj in data.objects)), 0.5)]
score, cert = _summarize(signals)
usages["Animation"] = {"score": score, "certainty": cert}

# Rendering
default_paths = ("/tmp/", "/tmp\\\\", "")
signals = [(float(scene.render.engine not in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE")), 0.5), (float(scene.render.filepath not in default_paths), 0.8)]
node_tree = getattr(scene, "node_tree", None)
signals.append((float(bool(node_tree and any(n.type == "R_LAYERS" for n in node_tree.nodes))), 1.0))
score, cert = _summarize(signals)
usages["Rendering"] = {"score": score, "certainty": cert}

# Scripting
signals = [(float(bool(data.texts)), 1.0)]
score, cert = _summarize(signals)
usages["Scripting"] = {"score": score, "certainty": cert}

# Video Editing
has_sequences = any(s.sequence_editor and bool(getattr(s.sequence_editor, "strips", ())) for s in data.scenes)
signals = [(float(has_sequences), 1.0)]
score, cert = _summarize(signals)
usages["Video Editing"] = {"score": score, "certainty": cert}

# Modeling
_DEFAULT_CUBE_VERTS = 8
non_default = [m for m in data.meshes if m.name != "Cube" or len(m.vertices) != _DEFAULT_CUBE_VERTS]
signals = [
    (float(bool(non_default)), 0.8),
    (float(bool(non_default and any(len(m.uv_layers) > 1 or bool(m.color_attributes) for m in non_default))), 0.7),
    (float(bool(data.curves) or bool(data.metaballs)), 0.7),
    (float(any(bool(obj.modifiers) for obj in data.objects)), 0.5)
]
score, cert = _summarize(signals)
usages["Modeling"] = {"score": score, "certainty": cert}

# Grease Pencil
signals = [(float(bool(data.grease_pencils)), 1.0)]
score, cert = _summarize(signals)
usages["Grease Pencil"] = {"score": score, "certainty": cert}

# Geometry Nodes
has_gn = any(any(mod.type == "NODES" and mod.node_group for mod in obj.modifiers) for obj in data.objects)
signals = [(float(has_gn), 1.0)]
score, cert = _summarize(signals)
usages["Geometry Nodes"] = {"score": score, "certainty": cert}

# Compositing
signals = [(float(bool(node_tree and scene.use_nodes and len(node_tree.nodes) > 2)), 1.0)]
score, cert = _summarize(signals)
usages["Compositing"] = {"score": score, "certainty": cert}

# UV Unwrapping
has_extra_uv = any(len(mesh.uv_layers) > 1 for mesh in data.meshes)
has_renamed_uv = any(any(uv.name != "UVMap" for uv in mesh.uv_layers) for mesh in data.meshes)
has_tex_image = any(mat.node_tree and any(n.type == "TEX_IMAGE" and n.image for n in mat.node_tree.nodes) for mat in data.materials)
signals = [(float(has_extra_uv), 1.0), (float(has_renamed_uv), 0.7), (float(has_tex_image), 0.7)]
score, cert = _summarize(signals)
usages["UV Unwrapping"] = {"score": score, "certainty": cert}

# Motion Tracking
signals = [(float(bool(data.movieclips)), 1.0)]
score, cert = _summarize(signals)
usages["Motion Tracking"] = {"score": score, "certainty": cert}

# Audio
signals = [(float(bool(data.sounds)), 1.0), (float(bool(data.speakers)), 1.0)]
score, cert = _summarize(signals)
usages["Audio"] = {"score": score, "certainty": cert}

result = {"status": "ok", "usage_guesses": usages}`
}

function buildForceRedraw() {
	return `import bpy
try:
    bpy.context.view_layer.update()
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            a.tag_redraw()
    bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP', iterations=3)
    result = {"status": "ok", "message": "redraw_forced"}
except Exception as e:
    result = {"status": "error", "message": str(e)}`
}

function buildGetScreenshotOfAreaAsImage(areaType, sizeLimit) {
	const at = escStr(areaType || 'VIEW_3D')
	const limit = Number(sizeLimit) || IMAGE_SIZE_LIMIT
	const maxDim = IMAGE_MAX_WIDTH
	return `import bpy, tempfile, os, base64, time
${IMAGE_DOWNSCALE_CODE}
_area_type = "${at}"
if bpy.app.background:
    result = {"status": "error", "message": "Screenshots not available in background mode"}
elif bpy.context.window is None:
    result = {"status": "error", "message": "No active window"}
else:
    target_window = bpy.context.window
    target_area = None
    target_region = None
    for area in target_window.screen.areas:
        if area.type == _area_type:
            target_area = area
            for region in area.regions:
                if region.type == 'WINDOW':
                    target_region = region
                    break
            break
    if target_area is None:
        available = [a.type for a in target_window.screen.areas]
        result = {"status": "error", "message": f"No area of type {_area_type!r} found. Available: {available}"}
    else:
        with tempfile.TemporaryDirectory(prefix="blmcp_screenshot_") as tmpdir:
            fp = os.path.join(tmpdir, "screenshot.png")
            try:
                bpy.context.view_layer.update()
                for w in bpy.context.window_manager.windows:
                    for a in w.screen.areas:
                        a.tag_redraw()
                bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP', iterations=3)
                if target_region is not None:
                    with bpy.context.temp_override(window=target_window, area=target_area, region=target_region):
                        bpy.ops.screen.screenshot_area(filepath=fp, check_existing=False)
                else:
                    with bpy.context.temp_override(window=target_window, area=target_area):
                        bpy.ops.screen.screenshot_area(filepath=fp, check_existing=False)
            except RuntimeError as ex:
                result = {"status": "error", "message": str(ex)}
            else:
                if not os.path.exists(fp):
                    result = {"status": "error", "message": "Screenshot file not created"}
                else:
                    img_bytes = _downscale_image(tmpdir, fp, ${limit}, ${maxDim}, ${limit} // 16)
                    result = {
                        "status": "ok",
                        "image_base64": base64.b64encode(img_bytes).decode("ascii"),
                        "area_type": _area_type,
                        "mime_type": "image/png",
                        "screenshot_id": str(int(time.time() * 1000)),
                        "file_size": len(img_bytes)
                    }`
}

function buildGetScreenshotOfWindowAsImage(sizeLimit) {
	const limit = Number(sizeLimit) || IMAGE_SIZE_LIMIT
	const maxDim = IMAGE_MAX_WIDTH
	return `import bpy, tempfile, os, base64, time
${IMAGE_DOWNSCALE_CODE}
if bpy.app.background:
    result = {"status": "error", "message": "Screenshots not available in background mode"}
elif bpy.context.window is None:
    result = {"status": "error", "message": "No active window"}
else:
    with tempfile.TemporaryDirectory(prefix="blmcp_screenshot_") as tmpdir:
        fp = os.path.join(tmpdir, "screenshot.png")
        try:
            bpy.context.view_layer.update()
            for w in bpy.context.window_manager.windows:
                for a in w.screen.areas:
                    a.tag_redraw()
            bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP', iterations=3)
            with bpy.context.temp_override(window=bpy.context.window):
                bpy.ops.screen.screenshot(filepath=fp, check_existing=False)
        except RuntimeError as ex:
            result = {"status": "error", "message": str(ex)}
        else:
            if not os.path.exists(fp):
                result = {"status": "error", "message": "Screenshot file not created"}
            else:
                img_bytes = _downscale_image(tmpdir, fp, ${limit}, ${maxDim}, ${limit} // 16)
                result = {
                    "status": "ok",
                    "image_base64": base64.b64encode(img_bytes).decode("ascii"),
                    "mime_type": "image/png",
                    "screenshot_id": str(int(time.time() * 1000)),
                    "file_size": len(img_bytes)
                }`
}

function buildGetScreenshotOfWindowAsJson() {
	return `import bpy
from bpy import context

if bpy.app.background:
    result = {"status": "error", "message": "Window layout not available in background mode", "areas": [], "active_object": None, "selected_objects": []}
elif context.window is None:
    result = {"status": "error", "message": "No active window", "areas": [], "active_object": None, "selected_objects": []}
else:
    window = context.window
    screen = window.screen
    areas = []
    for area in screen.areas:
        area_info = {"type": area.type, "x": area.x, "y": area.y, "width": area.width, "height": area.height}
        space = area.spaces.active
        if space:
            space_info = {"type": space.type}
            if space.type == "VIEW_3D":
                r3d = space.region_3d
                if r3d:
                    space_info["view_perspective"] = r3d.view_perspective
                    space_info["view_location"] = list(r3d.view_location)
                if hasattr(space, "shading"):
                    space_info["shading_type"] = space.shading.type
                space_info["show_overlays"] = space.overlay.show_overlays
            elif space.type == "PROPERTIES":
                space_info["context"] = space.context
            elif space.type == "OUTLINER":
                space_info["display_mode"] = space.display_mode
            elif space.type == "TEXT_EDITOR":
                if space.text:
                    space_info["text_name"] = space.text.name
            elif space.type == "NODE_EDITOR":
                space_info["tree_type"] = space.tree_type
                if space.node_tree:
                    space_info["node_tree_name"] = space.node_tree.name
            area_info["space"] = space_info
        regions = []
        for region in area.regions:
            if region.width > 0 and region.height > 0:
                regions.append({"type": region.type, "x": region.x, "y": region.y, "width": region.width, "height": region.height})
        area_info["regions"] = regions
        areas.append(area_info)
    active = context.active_object
    active_info = None
    if active:
        active_info = {"name": active.name, "type": active.type, "mode": context.mode, "location": list(active.location)}
    selected = [{"name": obj.name, "type": obj.type} for obj in context.selected_objects]
    result = {
        "status": "ok",
        "window_width": window.width,
        "window_height": window.height,
        "screen_name": screen.name,
        "workspace": window.workspace.name,
        "scene": context.scene.name,
        "areas": areas,
        "active_object": active_info,
        "selected_objects": selected,
    }`
}

function buildJumpToTabByName(workspaceName) {
	const n = escStr(workspaceName)
	return `import bpy

_ws_name = "${n}"
if bpy.app.background:
    result = {"status": "error", "message": "Not available in background mode"}
elif bpy.context.window is None:
    result = {"status": "error", "message": "No active window"}
else:
    ws = bpy.data.workspaces.get(_ws_name)
    if ws is None:
        available = [w.name for w in bpy.data.workspaces]
        result = {"status": "error", "message": f"Workspace {_ws_name!r} not found", "available_workspaces": available}
    else:
        bpy.context.window.workspace = ws
        result = {"status": "ok", "workspace": ws.name}`
}

function buildJumpToTabBySpaceType(spaceType, allowEdits) {
	const st = escStr(spaceType)
	const ae = allowEdits ? 'True' : 'False'
	return `import bpy

_space_type = "${st}"
if bpy.app.background:
    result = {"status": "error", "message": "Not available in background mode"}
elif bpy.context.window is None:
    result = {"status": "error", "message": "No active window"}
else:
    def _largest_area(scrn):
        return max(scrn.areas, key=lambda a: a.width * a.height, default=None)

    found = None
    for ws in bpy.data.workspaces:
        for scrn in ws.screens:
            area = _largest_area(scrn)
            if area is not None and area.type == _space_type:
                found = ws
                break
        if found:
            break
    if found:
        bpy.context.window.workspace = found
        result = {"status": "ok", "workspace": found.name, "space_type": _space_type, "created": False}
    elif ${ae}:
        try:
            bpy.ops.workspace.duplicate()
        except RuntimeError as ex:
            result = {"status": "error", "message": str(ex)}
        else:
            new_ws = bpy.context.window.workspace
            new_ws.name = _space_type.replace("_", " ").title()
            area = _largest_area(bpy.context.screen)
            if area is not None:
                area.type = _space_type
            result = {"status": "ok", "workspace": new_ws.name, "space_type": _space_type, "created": True}
    else:
        available = sorted({a.type for ws in bpy.data.workspaces for scrn in ws.screens for a in (_largest_area(scrn),) if a is not None})
        result = {"status": "error", "message": f"No workspace with space type {_space_type!r} found", "available_space_types": available}`
}

function buildJumpToView3dObjectByName(objectName, allowEdits) {
	const n = escStr(objectName)
	const ae = allowEdits ? 'True' : 'False'
	return `import bpy

_obj_name = "${n}"
if bpy.app.background:
    result = {"status": "error", "message": "Not available in background mode"}
elif bpy.context.window is None:
    result = {"status": "error", "message": "No active window"}
else:
    obj = bpy.data.objects.get(_obj_name)
    if obj is None:
        result = {"status": "error", "message": f"Object {_obj_name!r} not found"}
    else:
        if ${ae}:
            if obj.hide_viewport:
                obj.hide_viewport = False
            if obj.hide_get():
                obj.hide_set(False)
            def _enable_collections(layer_col, target):
                found = False
                for child in layer_col.children:
                    if _enable_collections(child, target):
                        found = True
                if target.name in layer_col.collection.objects:
                    found = True
                if found:
                    layer_col.exclude = False
                    layer_col.hide_viewport = False
                return found
            _enable_collections(bpy.context.view_layer.layer_collection, obj)
        if bpy.context.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        view3d_found = False
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                view3d_found = True
                r3d = area.spaces.active.region_3d
                if r3d and r3d.view_perspective == "CAMERA":
                    r3d.view_perspective = "PERSP"
                for region in area.regions:
                    if region.type == "WINDOW":
                        with bpy.context.temp_override(area=area, region=region):
                            bpy.ops.view3d.view_selected()
                        break
                break
        msg = None if view3d_found else "No 3D viewport found, object selected but not framed"
        result = {"status": "ok", "object": _obj_name, "type": obj.type, "location": list(obj.location), "message": msg}`
}

function buildJumpToView3dObjectDataByName(dataName, allowEdits) {
	const n = escStr(dataName)
	const ae = allowEdits ? 'True' : 'False'
	return `import bpy

_data_name = "${n}"
if bpy.app.background:
    result = {"status": "error", "message": "Not available in background mode"}
elif bpy.context.window is None:
    result = {"status": "error", "message": "No active window"}
else:
    target = None
    for obj in bpy.data.objects:
        if obj.data is not None and obj.data.name == _data_name:
            target = obj
            break
    if target is None:
        result = {"status": "error", "message": f"No object found with data named {_data_name!r}"}
    else:
        if ${ae}:
            if target.hide_viewport:
                target.hide_viewport = False
            if target.hide_get():
                target.hide_set(False)
            def _enable_collections(layer_col, tgt):
                found = False
                for child in layer_col.children:
                    if _enable_collections(child, tgt):
                        found = True
                if tgt.name in layer_col.collection.objects:
                    found = True
                if found:
                    layer_col.exclude = False
                    layer_col.hide_viewport = False
                return found
            _enable_collections(bpy.context.view_layer.layer_collection, target)
        if bpy.context.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        view3d_found = False
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                view3d_found = True
                r3d = area.spaces.active.region_3d
                if r3d and r3d.view_perspective == "CAMERA":
                    r3d.view_perspective = "PERSP"
                for region in area.regions:
                    if region.type == "WINDOW":
                        with bpy.context.temp_override(area=area, region=region):
                            bpy.ops.view3d.view_selected()
                        break
                break
        msg = None if view3d_found else "No 3D viewport found, object selected but not framed"
        result = {"status": "ok", "object": target.name, "data_name": _data_name, "type": target.type, "location": list(target.location), "message": msg}`
}

function buildImportModelCode(filePaths) {
	const fps = Array.isArray(filePaths) ? filePaths : [filePaths]
	const pyList = '[' + fps.map((p) => `"${escStr(p)}"`).join(', ') + ']'
	return `import bpy, os, json, traceback

file_paths = ${pyList}
results = []

def _find_3d_view_context():
    try:
        for window in bpy.context.window_manager.windows:
            for area in window.screen.areas:
                if area.type == 'VIEW_3D':
                    for region in area.regions:
                        if region.type == 'WINDOW':
                            return window, area, region
    except Exception:
        pass
    return None, None, None

def _import_one(fpath):
    if not os.path.exists(fpath):
        return {"path": fpath, "status": "error", "message": "File not found: " + fpath}
    ext = os.path.splitext(fpath)[1].lower()
    try:
        ctx_window, ctx_area, ctx_region = _find_3d_view_context()
        try:
            scene = bpy.context.scene
            before = set(scene.objects) if scene else set()
        except Exception:
            before = set()
        def _do_import():
            if ext in ('.glb', '.gltf'):
                bpy.ops.import_scene.gltf(filepath=fpath)
            elif ext == '.fbx':
                bpy.ops.import_scene.fbx(filepath=fpath)
            elif ext == '.obj':
                bpy.ops.wm.obj_import(filepath=fpath)
            elif ext == '.stl':
                bpy.ops.wm.stl_import(filepath=fpath)
            elif ext == '.dae':
                bpy.ops.wm.collada_import(filepath=fpath)
            else:
                return {"path": fpath, "status": "error", "message": "Unsupported format: " + ext}
            return None
        err = None
        if ctx_area and ctx_region and ctx_window:
            try:
                with bpy.context.temp_override(window=ctx_window, area=ctx_area, region=ctx_region):
                    err = _do_import()
            except Exception as e:
                err = _do_import()
        else:
            err = _do_import()
        if err is not None:
            return err
        try:
            scene = bpy.context.scene
            after = set(scene.objects) if scene else set()
            new_objs = [o.name for o in list(after - before)]
        except Exception:
            new_objs = []
        return {"path": fpath, "status": "ok", "imported": os.path.basename(fpath), "format": ext, "new_objects": new_objs, "count": len(new_objs)}
    except Exception as e:
        tb = traceback.format_exc()
        return {"path": fpath, "status": "error", "message": "Import failed: " + str(e), "traceback": tb}

try:
    for fp in file_paths:
        results.append(_import_one(fp))
    ok_count = sum(1 for r in results if r.get("status") == "ok")
    err_count = len(results) - ok_count
    if ok_count == 0 and err_count > 0:
        first_err = results[0]
        err_detail = first_err.get("message", "Unknown error")
        if first_err.get("traceback"):
            err_detail += "\\n[Traceback]\\n" + first_err["traceback"]
        print("[DVStudio Import Error] " + err_detail)
    result = {"status": "ok" if err_count == 0 else ("partial" if ok_count > 0 else "error"), "ok_count": ok_count, "error_count": err_count, "total": len(results), "results": results}
except Exception as e:
    tb = traceback.format_exc()
    print("[DVStudio Import Fatal Error] " + str(e) + "\\n" + tb)
    result = {"status": "error", "ok_count": 0, "error_count": len(file_paths), "total": len(file_paths), "results": [{"path": fp, "status": "error", "message": "Fatal: " + str(e), "traceback": tb} for fp in file_paths], "fatal_error": str(e), "traceback": tb}
`
}

const WIN_COMMON_BLENDER_PATHS = [
	'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
	'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
	'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
	'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
	'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
	'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
	'C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe',
	'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Blender\\blender.exe'
]

function fileExists(p) {
	try {
		return fs.statSync(p).isFile()
	} catch {
		return false
	}
}

function findBlenderInPath() {
	return new Promise((resolve) => {
		const cmd = process.platform === 'win32' ? 'where' : 'which'
		const target = process.platform === 'win32' ? 'blender.exe' : 'blender'
		execFile(cmd, [target], { timeout: 5000 }, (err, stdout) => {
			if (err) return resolve(null)
			const first = String(stdout || '')
				.split(/\r?\n/)
				.map((s) => s.trim())
				.filter(Boolean)[0]
			resolve(first && fileExists(first) ? first : null)
		})
	})
}

function _queryRegistryForKey(regPath) {
	return new Promise((resolve) => {
		const { execFile: ef } = require('child_process')
		ef(
			'reg',
			['query', regPath, '/s', '/f', 'Blender', '/e'],
			{ timeout: 6000, maxBuffer: 2 * 1024 * 1024 },
			(err, stdout) => {
				if (err) return resolve(null)
				const text = String(stdout || '')
				const sections = text.split(/\r?\n\r?\n/)
				for (const section of sections) {
					const iconMatch = section.match(/DisplayIcon\s+REG_SZ\s+(.+blender\.exe)/i)
					if (iconMatch) {
						const p = iconMatch[1].trim()
						if (fileExists(p)) return resolve(p)
					}
					const locMatch = section.match(/InstallLocation\s+REG_SZ\s+(.+)/)
					if (locMatch) {
						const loc = locMatch[1]
							.trim()
							.split(/\r?\n/)[0]
							.replace(/[\\/]+$/, '')
						const candidate = path.join(loc, 'blender.exe')
						if (fileExists(candidate)) return resolve(candidate)
					}
				}
				resolve(null)
			}
		)
	})
}

async function findWindowsRegistryBlender() {
	if (process.platform !== 'win32') return null
	const keys = [
		'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
		'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
	]
	for (const k of keys) {
		const found = await _queryRegistryForKey(k)
		if (found) return found
	}
	return null
}

async function findBlenderExecutable(hintPath) {
	if (hintPath && typeof hintPath === 'string') {
		if (fileExists(hintPath)) return hintPath
		const withExe = hintPath.toLowerCase().endsWith('.exe') ? hintPath : hintPath + '.exe'
		if (fileExists(withExe)) return withExe
	}
	if (process.platform === 'win32') {
		for (const p of WIN_COMMON_BLENDER_PATHS) {
			if (fileExists(p)) return p
		}
	}
	const registryPath = await findWindowsRegistryBlender()
	if (registryPath) return registryPath
	const pathExe = await findBlenderInPath()
	if (pathExe) return pathExe
	return null
}

function resolveToAbsoluteFilePath(rawPath) {
	const p = String(rawPath || '').trim()
	if (!p) return ''

	if (/^file:\/\//i.test(p)) {
		try {
			const u = new URL(p)
			let decoded = decodeURIComponent(u.pathname)
			if (process.platform === 'win32' && /^\/[A-Za-z]:[\\/]/.test(decoded)) {
				decoded = decoded.slice(1)
			}
			decoded = decoded.replace(/\//g, path.sep)
			if (fileExists(decoded)) return decoded
		} catch {}
	}

	if (/^dweb:\/\//i.test(p)) {
		try {
			const u = new URL(p)
			const rel = decodeURIComponent(String(u.searchParams.get('path') || ''))
			if (rel) {
				const roots = Object.values(getProjectRootSnapshot() || {})
				for (const root of roots) {
					const candidate = path.resolve(String(root), rel.replace(/\\/g, path.sep))
					if (fileExists(candidate)) return candidate
				}
				if (path.isAbsolute(rel) && fileExists(rel)) return rel
			}
		} catch {}
	}

	if (/^[A-Za-z]:[\\/]/.test(p)) {
		const normalized = path.normalize(p)
		if (fileExists(normalized)) return normalized
		return normalized
	}

	const separatorsNormalized = p.replace(/\\/g, '/').replace(/\/+/g, '/')
	const roots = Object.values(getProjectRootSnapshot() || {})
	const candidates = []

	candidates.push(separatorsNormalized)

	const stripPrefixes = ['Content/Media/', 'content/media/', 'Media/', 'media/']
	for (const prefix of stripPrefixes) {
		if (separatorsNormalized.startsWith(prefix)) {
			candidates.push(separatorsNormalized.slice(prefix.length))
		}
	}

	const subDirs = ['images', 'videos', 'audio', 'models', 'thumbnails', 'exports', 'generated']
	const basename = path.basename(separatorsNormalized)
	for (const sub of subDirs) {
		candidates.push(`Content/Media/${sub}/${basename}`)
	}

	for (const root of roots) {
		for (const cand of candidates) {
			const abs = path.resolve(String(root), cand.replace(/\//g, path.sep))
			if (fileExists(abs)) return abs
		}
	}

	if (path.isAbsolute(p)) return path.normalize(p)

	logger.warn(`[BlenderImport] Could not resolve path to absolute/existing file: ${p}`)
	return p
}

function buildCliImportScript(filePaths, resultFilePath) {
	const fps = Array.isArray(filePaths) ? filePaths : [filePaths]
	return `import bpy, os, sys, json, traceback

file_paths = ${JSON.stringify(fps)}
result_file = ${JSON.stringify(resultFilePath)}
results = []

def _find_3d_view_context():
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                for region in area.regions:
                    if region.type == 'WINDOW':
                        return window, area, region
    return None, None, None

def _import_one(fpath):
    if not os.path.exists(fpath):
        return {"path": fpath, "status": "error", "message": "File not found: " + fpath}
    ext = os.path.splitext(fpath)[1].lower()
    try:
        before = set(bpy.context.scene.objects)
        def _do_import():
            if ext in ('.glb', '.gltf'):
                bpy.ops.import_scene.gltf(filepath=fpath)
            elif ext == '.fbx':
                bpy.ops.import_scene.fbx(filepath=fpath)
            elif ext == '.obj':
                bpy.ops.wm.obj_import(filepath=fpath)
            elif ext == '.stl':
                bpy.ops.wm.stl_import(filepath=fpath)
            elif ext == '.dae':
                bpy.ops.wm.collada_import(filepath=fpath)
            elif ext == '.blend':
                with bpy.data.libraries.load(fpath) as (data_from, data_to):
                    data_to.objects = list(data_from.objects)
                for obj in data_to.objects:
                    if obj is not None:
                        bpy.context.collection.objects.link(obj)
            else:
                return {"path": fpath, "status": "error", "message": "Unsupported format: " + ext}
            return None
        ctx_window, ctx_area, ctx_region = _find_3d_view_context()
        err = None
        if ctx_area and ctx_region:
            with bpy.context.temp_override(window=ctx_window, area=ctx_area, region=ctx_region):
                err = _do_import()
        else:
            err = _do_import()
        if err is not None:
            return err
        after = set(bpy.context.scene.objects)
        new_objs = [o.name for o in list(after - before)]
        return {"path": fpath, "status": "ok", "imported": os.path.basename(fpath), "format": ext, "new_objects": new_objs, "count": len(new_objs)}
    except Exception as e:
        return {"path": fpath, "status": "error", "message": "Import failed: " + str(e)}

def _do_all_imports():
    for fp in file_paths:
        results.append(_import_one(fp))
    ok_count = sum(1 for r in results if r.get("status") == "ok")
    err_count = len(results) - ok_count
    final = {"status": "ok" if err_count == 0 else ("partial" if ok_count > 0 else "error"), "ok_count": ok_count, "error_count": err_count, "total": len(results), "results": results}
    try:
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump(final, f, ensure_ascii=False)
    except Exception as e:
        sys.stderr.write("Write result error: " + str(e) + "\\n")
    print("__BLENDER_CLI_IMPORT_RESULT__:" + json.dumps(final))
    sys.stdout.flush()
    return None

def _wait_for_ui():
    try:
        w, a, r = _find_3d_view_context()
        if a is not None:
            _do_all_imports()
            return None
    except Exception:
        pass
    return 0.5

bpy.app.timers.register(_wait_for_ui, first_interval=0.5)
`
}

const CLI_TIMEOUT_MS = 60000
const RESULT_FILE_POLL_MS = 500

async function runCliImport(blenderExe, filePaths) {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvstudio-blender-import-'))
	const scriptPath = path.join(tmpDir, 'import_models.py')
	const resultFilePath = path.join(tmpDir, 'result.json')
	const scriptContent = buildCliImportScript(filePaths, resultFilePath)
	fs.writeFileSync(scriptPath, scriptContent, 'utf-8')

	return new Promise((resolve) => {
		let stdout = ''
		let stderr = ''
		let settled = false
		const settle = (result) => {
			if (settled) return
			settled = true
			resolve(result)
		}

		const args = ['--python', scriptPath]
		const child = spawn(blenderExe, args, {
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: false
		})
		child.unref()

		child.stdout.on('data', (d) => {
			stdout += d.toString('utf-8')
		})
		child.stderr.on('data', (d) => {
			stderr += d.toString('utf-8')
		})

		let pollCount = 0
		const maxPolls = Math.floor(CLI_TIMEOUT_MS / RESULT_FILE_POLL_MS)
		const pollTimer = setInterval(() => {
			pollCount++
			if (settled) {
				clearInterval(pollTimer)
				return
			}
			if (fileExists(resultFilePath)) {
				clearInterval(pollTimer)
				try {
					const raw = fs.readFileSync(resultFilePath, 'utf-8')
					const pyResult = JSON.parse(raw)
					const imported = (pyResult.results || []).filter((r) => r && r.status === 'ok')
					const failed = (pyResult.results || []).filter((r) => r && r.status !== 'ok')
					if (!imported.length) {
						const firstErr = failed[0]
						settle({
							ok: false,
							error: firstErr?.message || '模型导入失败',
							stderr: (stderr || '').slice(-800)
						})
						return
					}
					settle({
						ok: true,
						count: imported.length,
						total: pyResult.total || filePaths.length,
						errorCount: failed.length,
						imported: imported.map((r) => ({
							path: r.path,
							name: r.imported,
							newObjects: r.new_objects || [],
							count: r.count || 0
						}))
					})
				} catch (e) {
					settle({
						ok: false,
						error: '解析导入结果失败：' + (e && e.message ? e.message : String(e))
					})
				}
				return
			}
			if (pollCount >= maxPolls) {
				clearInterval(pollTimer)
				const markerIdx = (stdout + '\n' + stderr).indexOf('__BLENDER_CLI_IMPORT_RESULT__:')
				if (markerIdx >= 0) {
					try {
						const part = (stdout + '\n' + stderr).substring(
							markerIdx + '__BLENDER_CLI_IMPORT_RESULT__:'.length
						)
						const nl = part.indexOf('\n')
						const jsonStr = (nl >= 0 ? part.substring(0, nl) : part).trim()
						const pyResult = JSON.parse(jsonStr)
						const imported = (pyResult.results || []).filter((r) => r && r.status === 'ok')
						if (imported.length) {
							settle({
								ok: true,
								count: imported.length,
								total: pyResult.total,
								errorCount: pyResult.error_count || 0,
								imported: imported.map((r) => ({
									path: r.path,
									name: r.imported,
									newObjects: r.new_objects || []
								})),
								note: 'Blender已启动，导入完成'
							})
							return
						}
					} catch {}
				}
				settle({
					ok: true,
					count: filePaths.length,
					total: filePaths.length,
					errorCount: 0,
					imported: filePaths.map((p) => ({ path: p, name: path.basename(p) })),
					note: 'Blender已启动，模型导入中，请在Blender中查看'
				})
			}
		}, RESULT_FILE_POLL_MS)

		child.on('error', (err) => {
			clearInterval(pollTimer)
			settle({ ok: false, error: `启动Blender失败：${err.message}` })
		})
	})
}

class BlenderTcpClient {
	constructor(host, port) {
		this.host = host
		this.port = Number(port)
	}

	async sendCommand(commandType, params = {}) {
		return new Promise((resolve, reject) => {
			const socket = new net.Socket()
			let buffer = Buffer.alloc(0)
			let resolved = false
			let connectTimeout = null

			const cleanup = () => {
				if (connectTimeout) {
					clearTimeout(connectTimeout)
					connectTimeout = null
				}
				try {
					socket.destroy()
				} catch {}
			}

			const CONNECT_TIMEOUT_MS = 8000
			socket.setTimeout(SOCKET_TIMEOUT_MS)

			socket.on('timeout', () => {
				if (!resolved) {
					resolved = true
					cleanup()
					reject(
						new Error(
							`Blender连接超时（${this.host}:${this.port}），请确认Blender已启动且MCP插件在该端口上监听`
						)
					)
				}
			})

			socket.on('error', (err) => {
				if (!resolved) {
					resolved = true
					cleanup()
					let msg = `Blender连接失败（${this.host}:${this.port}）: ${err.message}`
					if (err.code === 'ECONNREFUSED') {
						msg = `无法连接到Blender（${this.host}:${this.port}）：连接被拒绝。请确认：\n1. Blender已启动\n2. MCP插件已启用并在端口${this.port}上监听\n3. 端口号与Blender插件设置一致`
					} else if (err.code === 'ECONNRESET') {
						msg = `Blender连接被重置（${this.host}:${this.port}），MCP插件可能未正确启动`
					} else if (err.code === 'ENOTFOUND') {
						msg = `主机名解析失败（${this.host}）`
					}
					reject(new Error(msg))
				}
			})

			socket.on('close', () => {
				if (!resolved) {
					resolved = true
					reject(new Error(`Blender连接已关闭（${this.host}:${this.port}）`))
				}
			})

			socket.on('data', (data) => {
				buffer = Buffer.concat([buffer, data])
				if (buffer.length > MAX_RESPONSE_BYTES) {
					resolved = true
					cleanup()
					reject(new Error('Blender响应数据过大（超过50MB）'))
					return
				}
				const nullIdx = buffer.indexOf(0)
				if (nullIdx !== -1) {
					const msgBytes = buffer.subarray(0, nullIdx)
					try {
						const response = JSON.parse(msgBytes.toString('utf-8'))
						resolved = true
						cleanup()
						resolve(response)
					} catch (parseErr) {
						resolved = true
						cleanup()
						reject(new Error(`Blender响应解析失败: ${parseErr.message}`))
					}
				}
			})

			logger.debug(
				`[BlenderTcpClient] Connecting to ${this.host}:${this.port} for command: ${commandType}`
			)

			connectTimeout = setTimeout(() => {
				if (!resolved) {
					resolved = true
					cleanup()
					reject(
						new Error(
							`Blender连接超时（${this.host}:${this.port}，${CONNECT_TIMEOUT_MS}ms），无法建立TCP连接`
						)
					)
				}
			}, CONNECT_TIMEOUT_MS)

			socket.connect(this.port, this.host, () => {
				if (connectTimeout) {
					clearTimeout(connectTimeout)
					connectTimeout = null
				}
				logger.debug(
					`[BlenderTcpClient] Connected to ${this.host}:${this.port}, sending command: ${commandType}`
				)
				const request = { type: commandType, ...params, strict_json: false }
				const payload = Buffer.from(JSON.stringify(request) + '\0', 'utf-8')
				socket.write(payload)
			})
		})
	}

	async executeCode(code) {
		return await this.sendCommand('execute', { code })
	}

	async ping() {
		try {
			const response = await this.executeCode(
				'import bpy\nresult = {"status": "ok", "blender_version": bpy.app.version_string}'
			)
			if (response.status === 'error') {
				return { ok: false, error: response.message || 'Unknown error' }
			}
			return { ok: true, response }
		} catch (err) {
			return { ok: false, error: err.message }
		}
	}
}

const BRIDGE_DIR_NAME = 'dvstudio_blender_bridge'
const BRIDGE_STARTUP_FILENAME = 'dvstudio_bridge.py'
const BRIDGE_CMD_FILENAME = 'cmd.json'
const BRIDGE_RESULT_FILENAME = 'result.json'
const BRIDGE_STATUS_FILENAME = 'status.json'
const BRIDGE_COMMAND_TIMEOUT_MS = 60000
const BRIDGE_POLL_INTERVAL_MS = 200
const BRIDGE_STATUS_MAX_AGE_MS = 3000

function getBridgeDir() {
	const dir = path.join(os.tmpdir(), BRIDGE_DIR_NAME)
	try {
		fs.mkdirSync(dir, { recursive: true })
	} catch {}
	return dir
}

function getBridgeCmdPath() {
	return path.join(getBridgeDir(), BRIDGE_CMD_FILENAME)
}
function getBridgeResultPath() {
	return path.join(getBridgeDir(), BRIDGE_RESULT_FILENAME)
}
function getBridgeStatusPath() {
	return path.join(getBridgeDir(), BRIDGE_STATUS_FILENAME)
}

const BRIDGE_PYTHON_SCRIPT = `# DVStudio Blender Bridge - auto-installed, runs at Blender startup
import bpy
import os
import sys
import json
import time
import threading
import traceback

_bridge_dir = os.path.join(os.environ.get('TEMP', os.path.expanduser('~')), 'dvstudio_blender_bridge')
_cmd_path = os.path.join(_bridge_dir, 'cmd.json')
_result_path = os.path.join(_bridge_dir, 'result.json')
_status_path = os.path.join(_bridge_dir, 'status.json')
_lock_path = os.path.join(_bridge_dir, 'cmd.lock')

os.makedirs(_bridge_dir, exist_ok=True)

_last_cmd_id = None
_busy = False

def _write_json(p, data):
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, p)

def _update_status():
    try:
        _write_json(_status_path, {
            'pid': os.getpid(),
            'blender_version': bpy.app.version_string,
            'alive': True,
            'timestamp': time.time(),
            'busy': _busy
        })
    except Exception:
        pass

def _execute_code(code, exec_globals):
    try:
        exec(code, exec_globals)
        if 'result' in exec_globals:
            return {'ok': True, 'result': exec_globals['result']}
        return {'ok': True, 'result': {'status': 'ok'}}
    except Exception as e:
        return {'ok': False, 'error': str(e), 'traceback': traceback.format_exc()}

def _check_and_run():
    global _last_cmd_id, _busy
    try:
        if not os.path.exists(_cmd_path):
            _update_status()
            return 0.3
        try:
            with open(_cmd_path, 'r', encoding='utf-8') as f:
                cmd = json.load(f)
        except Exception:
            _update_status()
            return 0.3

        cmd_id = cmd.get('id')
        if cmd_id == _last_cmd_id:
            _update_status()
            return 0.3

        if os.path.exists(_result_path):
            try:
                with open(_result_path, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
                if existing.get('id') == cmd_id:
                    _last_cmd_id = cmd_id
                    _update_status()
                    return 0.3
            except Exception:
                pass

        _busy = True
        _update_status()
        code = cmd.get('code', '')

        exec_globals = {'__name__': '__main__', 'bpy': bpy}
        exec_result = _execute_code(code, exec_globals)

        _write_json(_result_path, {
            'id': cmd_id,
            'pid': os.getpid(),
            'timestamp': time.time(),
            **exec_result
        })
        _last_cmd_id = cmd_id
        _busy = False
        _update_status()
    except Exception:
        _busy = False
        try:
            _write_json(_result_path, {
                'id': _last_cmd_id,
                'pid': os.getpid(),
                'timestamp': time.time(),
                'ok': False,
                'error': 'Bridge internal error: ' + traceback.format_exc()
            })
        except Exception:
            pass
        _update_status()
    return 0.3

_update_status()

if not bpy.app.timers.is_registered(_check_and_run):
    bpy.app.timers.register(_check_and_run, persistent=True)
`

function getBlenderVersion(blenderExe) {
	return new Promise((resolve) => {
		execFile(blenderExe, ['--version'], { timeout: 8000, maxBuffer: 4096 }, (err, stdout) => {
			if (err) return resolve(null)
			const m = String(stdout || '').match(/Blender\s+(\d+)\.(\d+)/i)
			if (!m) return resolve(null)
			resolve({ major: parseInt(m[1], 10), minor: parseInt(m[2], 10), full: `${m[1]}.${m[2]}` })
		})
	})
}

function getAllBlenderUserScriptDirs() {
	const dirs = []
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA
		if (appData) {
			const blenderBase = path.join(appData, 'Blender Foundation', 'Blender')
			try {
				if (fs.existsSync(blenderBase) && fs.statSync(blenderBase).isDirectory()) {
					for (const entry of fs.readdirSync(blenderBase)) {
						const m = entry.match(/^(\d+)\.(\d+)$/)
						if (m) {
							const startupDir = path.join(blenderBase, entry, 'scripts', 'startup')
							dirs.push({ version: entry, dir: startupDir })
						}
					}
				}
			} catch {}
		}
	}
	return dirs
}

async function ensureBridgeInstalled(blenderExe) {
	const dirs = getAllBlenderUserScriptDirs()
	let targets = dirs

	if (blenderExe) {
		const ver = await getBlenderVersion(blenderExe)
		if (ver) {
			const verDir = path.join(
				process.env.APPDATA || '',
				'Blender Foundation',
				'Blender',
				ver.full,
				'scripts',
				'startup'
			)
			targets = [{ version: ver.full, dir: verDir }, ...dirs.filter((d) => d.version !== ver.full)]
		}
	}

	let installed = 0
	for (const { dir: startupDir } of targets) {
		try {
			fs.mkdirSync(startupDir, { recursive: true })
			const bridgePath = path.join(startupDir, BRIDGE_STARTUP_FILENAME)
			let shouldWrite = true
			if (fs.existsSync(bridgePath)) {
				try {
					const existing = fs.readFileSync(bridgePath, 'utf-8')
					if (existing.trim() === BRIDGE_PYTHON_SCRIPT.trim()) shouldWrite = false
				} catch {}
			}
			if (shouldWrite) {
				fs.writeFileSync(bridgePath, BRIDGE_PYTHON_SCRIPT, 'utf-8')
				logger.info(`[BlenderBridge] Installed bridge script to: ${bridgePath}`)
			}
			installed++
		} catch (e) {
			logger.warn(`[BlenderBridge] Failed to install bridge to ${startupDir}: ${e.message}`)
		}
	}
	return installed > 0
}

function detectRunningBlenderProcess() {
	return new Promise((resolve) => {
		if (process.platform !== 'win32') {
			resolve(false)
			return
		}
		execFile(
			'tasklist',
			['/FI', 'IMAGENAME eq blender.exe', '/NH'],
			{ timeout: 5000 },
			(err, stdout) => {
				if (err) return resolve(false)
				const text = String(stdout || '').toLowerCase()
				resolve(text.includes('blender.exe'))
			}
		)
	})
}

function isBridgeAlive() {
	try {
		const statusPath = getBridgeStatusPath()
		if (!fs.existsSync(statusPath)) return false
		const st = fs.statSync(statusPath)
		const age = Date.now() - st.mtimeMs
		if (age > BRIDGE_STATUS_MAX_AGE_MS) return false
		const raw = fs.readFileSync(statusPath, 'utf-8')
		const status = JSON.parse(raw)
		return !!status.alive
	} catch {
		return false
	}
}

function sendCommandToBridge(code, timeoutMs = BRIDGE_COMMAND_TIMEOUT_MS) {
	return new Promise((resolve) => {
		const bridgeDir = getBridgeDir()
		const cmdPath = getBridgeCmdPath()
		const resultPath = getBridgeResultPath()

		const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

		try {
			if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath)
		} catch {}

		const cmdPayload = JSON.stringify({ id: cmdId, code, timestamp: Date.now() })
		const cmdTmp = cmdPath + '.tmp'
		fs.writeFileSync(cmdTmp, cmdPayload, 'utf-8')
		fs.renameSync(cmdTmp, cmdPath)

		const start = Date.now()
		const poll = setInterval(() => {
			const elapsed = Date.now() - start
			if (elapsed > timeoutMs) {
				clearInterval(poll)
				resolve({ ok: false, error: `Blender桥接执行超时（${Math.round(timeoutMs / 1000)}秒）` })
				return
			}
			try {
				if (!fs.existsSync(resultPath)) return
				const raw = fs.readFileSync(resultPath, 'utf-8')
				const result = JSON.parse(raw)
				if (result.id !== cmdId) return
				clearInterval(poll)
				if (result.ok) {
					resolve({ ok: true, result: result.result })
				} else {
					resolve({
						ok: false,
						error: result.error || 'Blender执行错误',
						traceback: result.traceback
					})
				}
			} catch {}
		}, BRIDGE_POLL_INTERVAL_MS)
	})
}

class BlenderMcpService extends EventEmitter {
	constructor() {
		super()
		this.status = 'disconnected'
		this.host = DEFAULT_HOST
		this.port = DEFAULT_PORT
		this.client = null
		this._registeredToolNames = []
		this._workspaceContext = null
		this._registerTools()
	}

	setWorkspaceContext(projectRoot, nodeId) {
		if (projectRoot && nodeId) {
			this._workspaceContext = { projectRoot, nodeId }
			logger.info(`[BlenderMcpService] Workspace context set: ${projectRoot} / ${nodeId}`)
		} else {
			this._workspaceContext = null
			logger.info('[BlenderMcpService] Workspace context cleared')
		}
	}

	getWorkspaceContext() {
		return this._workspaceContext
	}

	_setStatus(status, extra = {}) {
		this.status = status
		const payload = { status, host: this.host, port: this.port, ...extra }
		this.emit('status-changed', payload)
		broadcastStatusToWindows(payload)
	}

	isConnected() {
		return this.status === 'connected'
	}

	getStatus() {
		return {
			status: this.status,
			host: this.host,
			port: this.port,
			toolCount: this._registeredToolNames.length,
			tools: this._registeredToolNames
		}
	}

	async connectMcp(port, host) {
		if (this.status === 'connected' || this.status === 'connecting') {
			logger.info('[BlenderMcpService] Already connected/connecting, disconnecting first')
			await this.disconnectMcp()
		}

		this.host = host || DEFAULT_HOST
		const parsedPort = Number(port)
		if (!parsedPort || parsedPort < 1 || parsedPort > 65535 || !Number.isInteger(parsedPort)) {
			logger.warn(
				`[BlenderMcpService] Invalid port ${port}, falling back to default ${DEFAULT_PORT}`
			)
			this.port = DEFAULT_PORT
		} else {
			this.port = parsedPort
		}
		this._setStatus('connecting')
		logger.info(
			`[BlenderMcpService] Connecting to Blender at ${this.host}:${this.port} via TCP (official addon protocol)`
		)

		try {
			this.client = new BlenderTcpClient(this.host, this.port)
			const ping = await this.client.ping()
			if (!ping.ok) {
				throw new Error(
					`无法连接Blender（${this.host}:${this.port}）: ${ping.error}。请确认：\n1. Blender 5.1+已启动\n2. Edit > Preferences > Add-ons中"MCP"插件已启用\n3. 插件端口设置为${this.port}（当前客户端配置端口）`
				)
			}

			this._setStatus('connected', {
				tools: this._registeredToolNames,
				toolCount: this._registeredToolNames.length
			})
			logger.info(
				`[BlenderMcpService] Connected to Blender at ${this.host}:${this.port} successfully, ${this._registeredToolNames.length} tools available`
			)

			return {
				ok: true,
				connected: true,
				host: this.host,
				port: this.port,
				toolCount: this._registeredToolNames.length,
				tools: this._registeredToolNames
			}
		} catch (err) {
			this._setStatus('error', { error: err.message })
			logger.error(
				`[BlenderMcpService] Connection failed to ${this.host}:${this.port}: ${err.message}`
			)
			this.client = null
			throw err
		}
	}

	_registerTools() {
		const executor = getToolExecutor()
		this._unregisterTools()

		const tools = [
			{
				name: 'execute_blender_code',
				description:
					'在Blender中执行任意Python(bpy)代码。代码执行后必须将结果赋值给名为result的字典变量。这是核心工具，所有场景操作都通过它完成。',
				inputSchema: {
					type: 'object',
					properties: {
						code: {
							type: 'string',
							description: '要执行的Python(bpy)代码。执行后必须设置result = {...}字典返回结果。'
						}
					},
					required: ['code']
				},
				handler: async (args) => await this._executeAndFormat(args.code)
			},
			{
				name: 'get_objects_summary',
				description:
					'获取场景的集合层级结构和所有对象列表（名称、类型、位置、可见性、选中状态），以及材质/相机/灯光名称列表。',
				inputSchema: { type: 'object', properties: {} },
				handler: async () => await this._executeAndFormat(buildGetObjectsSummary())
			},
			{
				name: 'get_object_detail_summary',
				description:
					'获取指定对象的结构化详细信息，包括变换、尺寸、父子关系、修改器、约束、材质、可见性、所属集合等。',
				inputSchema: {
					type: 'object',
					properties: { name: { type: 'string', description: '对象名称' } },
					required: ['name']
				},
				handler: async (args) =>
					await this._executeAndFormat(buildGetObjectDetailSummary(args.name))
			},
			{
				name: 'get_blendfile_summary_datablocks',
				description:
					'返回blend文件的数据块统计（各类datablock数量）、当前工作区、渲染引擎和Blender版本。',
				inputSchema: { type: 'object', properties: {} },
				handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryDatablocks())
			},
			{
				name: 'get_blendfile_summary_missing_files',
				description:
					'报告磁盘上缺失的外部文件引用（图片、链接库、字体、声音、视频、缓存、序列等）。',
				inputSchema: { type: 'object', properties: {} },
				handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryMissingFiles())
			},
			{
				name: 'get_blendfile_summary_of_linked_libraries',
				description: '返回直接和间接链接的库文件树，以及每个库链接的数据块数量。',
				inputSchema: { type: 'object', properties: {} },
				handler: async () =>
					await this._executeAndFormat(buildGetBlendfileSummaryOfLinkedLibraries())
			},
			{
				name: 'get_blendfile_summary_path_info',
				description:
					'获取blend文件的路径、保存状态、是否修改未保存、文件存在时长、大小和备份文件列表。',
				inputSchema: { type: 'object', properties: {} },
				handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryPathInfo())
			},
			{
				name: 'get_blendfile_summary_usage_guess',
				description:
					'猜测当前blend文件的主要用途（建模/渲染/动画/合成/几何节点/视频编辑/脚本/油脂笔/UV展开/运动跟踪/音频等），每项给出0-100分和置信度。',
				inputSchema: { type: 'object', properties: {} },
				handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryUsageGuess())
			},
			{
				name: 'get_screenshot_of_area_as_image',
				description:
					'【强制刷新】截取Blender中指定区域的最新截图并返回PNG图片（base64编码）。⚠️重要：每次需要查看当前画面状态时，必须调用此工具获取最新截图，绝不要使用blender_read_workspace_image读取历史截图文件！默认截取VIEW_3D区域，自动缩放到1MB以内。执行任何修改操作后，务必调用此工具验证结果。',
				inputSchema: {
					type: 'object',
					properties: {
						area_type: {
							type: 'string',
							description:
								'区域类型，如VIEW_3D、NODE_EDITOR、IMAGE_EDITOR、UV、GRAPH_EDITOR、DOPESHEET_EDITOR、OUTLINER、PROPERTIES等，默认VIEW_3D',
							default: 'VIEW_3D'
						},
						size_limit_in_bytes: {
							type: 'number',
							description: '图片大小限制（字节），默认786432(768KB以适应base64后1MB MCP限制)',
							default: 786432
						}
					}
				},
				handler: async (args) => {
					const code = buildGetScreenshotOfAreaAsImage(
						args.area_type || 'VIEW_3D',
						args.size_limit_in_bytes
					)
					return await this._executeScreenshotCode(code)
				}
			},
			{
				name: 'get_screenshot_of_window_as_image',
				description:
					'【强制刷新】截取整个Blender窗口的最新截图并返回PNG图片（base64编码），自动缩放到1MB以内。⚠️重要：每次需要查看当前画面状态时，必须调用此工具获取最新截图，绝不要使用blender_read_workspace_image读取历史截图文件！',
				inputSchema: {
					type: 'object',
					properties: {
						size_limit_in_bytes: {
							type: 'number',
							description: '图片大小限制（字节）',
							default: 786432
						}
					}
				},
				handler: async (args) => {
					const code = buildGetScreenshotOfWindowAsImage(args.size_limit_in_bytes)
					return await this._executeScreenshotCode(code)
				}
			},
			{
				name: 'get_screenshot_of_window_as_json',
				description:
					'返回Blender窗口布局的JSON描述，包括窗口尺寸、工作区、场景、所有区域类型/位置/大小、活动空间类型、活动对象和选中对象列表。',
				inputSchema: { type: 'object', properties: {} },
				handler: async () => await this._executeAndFormat(buildGetScreenshotOfWindowAsJson())
			},
			{
				name: 'jump_to_tab_by_name',
				description:
					'按名称切换到指定工作区（标签页），如"Modeling"、"Rendering"、"Animation"、"UV Editing"、"Scripting"、"Compositing"等。',
				inputSchema: {
					type: 'object',
					properties: { name: { type: 'string', description: '工作区名称' } },
					required: ['name']
				},
				handler: async (args) => await this._executeAndFormat(buildJumpToTabByName(args.name))
			},
			{
				name: 'jump_to_tab_by_space_type',
				description: '切换到主区域为指定空间类型的工作区。可选择是否在不存在时自动创建新工作区。',
				inputSchema: {
					type: 'object',
					properties: {
						space_type: {
							type: 'string',
							description:
								'空间类型，如VIEW_3D、NODE_EDITOR、IMAGE_EDITOR、UV、GRAPH_EDITOR、DOPESHEET_EDITOR、TEXT_EDITOR、PROPERTIES、OUTLINER等'
						},
						allow_edits: {
							type: 'boolean',
							description: '是否允许在找不到时自动创建新工作区',
							default: false
						}
					},
					required: ['space_type']
				},
				handler: async (args) =>
					await this._executeAndFormat(buildJumpToTabBySpaceType(args.space_type, args.allow_edits))
			},
			{
				name: 'jump_to_view3d_object_by_name',
				description:
					'在3D视口中选中并聚焦到指定对象。可选择是否自动显示隐藏对象和启用集合。会退出相机视角并框选对象。',
				inputSchema: {
					type: 'object',
					properties: {
						name: { type: 'string', description: '对象名称' },
						allow_edits: {
							type: 'boolean',
							description: '是否允许自动显示隐藏对象和启用集合',
							default: true
						}
					},
					required: ['name']
				},
				handler: async (args) =>
					await this._executeAndFormat(
						buildJumpToView3dObjectByName(args.name, args.allow_edits !== false)
					)
			},
			{
				name: 'jump_to_view3d_object_data_by_name',
				description: '在3D视口中选中并聚焦到数据块名称匹配的对象（如按Mesh名称查找）。',
				inputSchema: {
					type: 'object',
					properties: {
						name: { type: 'string', description: '数据块名称（如Mesh名称）' },
						allow_edits: { type: 'boolean', description: '是否允许自动显示隐藏对象', default: true }
					},
					required: ['name']
				},
				handler: async (args) =>
					await this._executeAndFormat(
						buildJumpToView3dObjectDataByName(args.name, args.allow_edits !== false)
					)
			},
			{
				name: 'import_model',
				description: '导入3D模型文件到Blender当前场景。支持.glb/.gltf/.fbx/.obj/.stl格式。',
				inputSchema: {
					type: 'object',
					properties: { file_path: { type: 'string', description: '模型文件的绝对路径' } },
					required: ['file_path']
				},
				handler: async (args) => await this._executeAndFormat(buildImportModelCode(args.file_path))
			},
			{
				name: 'read_workspace_image',
				description:
					'⚠️仅用于读取references目录中的参考图片，或用户明确要求查看历史保存的图片。【绝对禁止】用此工具查看Blender当前画面状态！查看当前状态必须使用blender_get_screenshot_of_area_as_image或blender_get_screenshot_of_window_as_image获取最新截图，否则会看到旧图片导致错误判断。',
				inputSchema: {
					type: 'object',
					properties: {
						path: {
							type: 'string',
							description:
								'图片的相对路径（相对于工作区根目录），如 "references/ref.png"。不要用此工具读取screenshots目录下的文件！'
						}
					},
					required: ['path']
				},
				handler: async (args) => await this._readWorkspaceImage(args.path)
			},
			{
				name: 'list_workspace_images',
				description:
					'列出工作区中所有可用的图片文件（screenshots和references目录），返回文件名、相对路径、绝对路径和大小。',
				inputSchema: { type: 'object', properties: {} },
				handler: async () => await this._listWorkspaceImages()
			}
		]

		for (const tool of tools) {
			const proxyName = `${BLENDER_TOOL_PREFIX}${tool.name}`
			executor.registerTool(proxyName, tool.description, tool.inputSchema, tool.handler)
			this._registeredToolNames.push(proxyName)
		}

		logger.info(
			`[BlenderMcpService] Registered ${this._registeredToolNames.length} tools: ${this._registeredToolNames.join(', ')}`
		)
	}

	_unregisterTools() {
		if (this._registeredToolNames.length === 0) return
		const executor = getToolExecutor()
		for (const name of this._registeredToolNames) {
			try {
				executor.tools.delete(name)
			} catch {}
		}
		this._registeredToolNames = []
	}

	checkToolsReady() {
		const executor = getToolExecutor()
		const expectedTools = [
			'blender_execute_blender_code',
			'blender_get_objects_summary',
			'blender_get_object_detail_summary',
			'blender_get_blendfile_summary_datablocks',
			'blender_get_blendfile_summary_missing_files',
			'blender_get_blendfile_summary_of_linked_libraries',
			'blender_get_blendfile_summary_path_info',
			'blender_get_blendfile_summary_usage_guess',
			'blender_get_screenshot_of_area_as_image',
			'blender_get_screenshot_of_window_as_image',
			'blender_get_screenshot_of_window_as_json',
			'blender_jump_to_tab_by_name',
			'blender_jump_to_tab_by_space_type',
			'blender_jump_to_view3d_object_by_name',
			'blender_jump_to_view3d_object_data_by_name',
			'blender_import_model',
			'blender_read_workspace_image',
			'blender_list_workspace_images'
		]

		let missingTools = []
		let availableTools = []
		for (const toolName of expectedTools) {
			if (executor.hasTool(toolName)) {
				availableTools.push(toolName)
			} else {
				missingTools.push(toolName)
			}
		}

		if (missingTools.length > 0 && this.status === 'connected') {
			logger.warn(
				`[BlenderMcpService] checkToolsReady: ${missingTools.length} tools missing despite connected status, auto-registering. Missing: ${missingTools.join(', ')}`
			)
			this._registerTools()
			missingTools = []
			availableTools = []
			for (const toolName of expectedTools) {
				if (executor.hasTool(toolName)) {
					availableTools.push(toolName)
				} else {
					missingTools.push(toolName)
				}
			}
			logger.info(
				`[BlenderMcpService] checkToolsReady: after auto-register, ${availableTools.length}/${expectedTools.length} tools available`
			)
		}

		const allExecutorTools = executor.listTools()
		const blenderToolsInExecutor = allExecutorTools.filter((t) => t.name.startsWith('blender_'))

		return {
			ready: missingTools.length === 0 && this.status === 'connected',
			expectedToolCount: expectedTools.length,
			availableToolCount: availableTools.length,
			missingToolCount: missingTools.length,
			missingTools,
			availableTools,
			allBlenderToolsInExecutor: blenderToolsInExecutor.map((t) => t.name),
			totalToolsInExecutor: allExecutorTools.length,
			status: this.status
		}
	}

	async _executeRaw(code) {
		if (!this.client || this.status !== 'connected') {
			throw new Error('Blender MCP未连接，请先在Blender节点面板中点击"连接Blender"建立连接')
		}
		return await this.client.executeCode(code)
	}

	async _executeAndFormat(code) {
		const response = await this._executeRaw(code)
		if (response.status === 'error') {
			let errMsg = response.message || 'Blender代码执行错误'
			if (response.stderr) {
				errMsg += `\n[stderr]\n${response.stderr}`
			}
			throw new Error(errMsg)
		}
		const result = response.result
		if (result && result.status === 'error') {
			let errMsg = result.message || '工具执行错误'
			if (result.available_objects) errMsg += `\n可用对象: ${result.available_objects.join(', ')}`
			if (result.available_workspaces)
				errMsg += `\n可用工作区: ${result.available_workspaces.join(', ')}`
			if (result.available_space_types)
				errMsg += `\n可用空间类型: ${result.available_space_types.join(', ')}`
			if (response.stderr) errMsg += `\n[stderr]\n${response.stderr}`
			throw new Error(errMsg)
		}

		let text = ''
		if (response.stdout) {
			text += response.stdout
		}
		if (response.stderr) {
			text += text ? '\n' : ''
			text += `[stderr]\n${response.stderr}`
		}

		if (result !== undefined && typeof result === 'object' && result.image_base64) {
			const sizeKB = Math.round((String(result.image_base64).length * 3) / 4 / 1024)
			const screenshotId = result.screenshot_id || String(Date.now())
			const content = []
			if (text.trim()) {
				content.push({ type: 'text', text: text.trim() })
			}

			let saveResult = null
			let savedPath = null
			let cacheBustUrl = null
			let savedFileName = null
			if (this._workspaceContext) {
				try {
					const workspace = getBlenderWorkspace()
					const imgMimeType = result.mime_type || 'image/png'
					saveResult = await workspace.saveScreenshot(
						this._workspaceContext.projectRoot,
						this._workspaceContext.nodeId,
						String(result.image_base64),
						imgMimeType,
						screenshotId
					)
					if (saveResult.ok) {
						savedPath = saveResult.absolutePath
						cacheBustUrl = saveResult.url
						savedFileName = saveResult.fileName
						logger.info(
							`[BlenderMcpService] Code screenshot auto-saved to workspace: ${savedPath}, screenshotId=${screenshotId}, fileName=${savedFileName}`
						)
					} else {
						logger.warn(
							`[BlenderMcpService] Failed to auto-save code screenshot: ${saveResult.error}`
						)
					}
				} catch (saveErr) {
					logger.warn(`[BlenderMcpService] Error auto-saving code screenshot: ${saveErr.message}`)
				}
			}

			const summary = savedPath
				? `✅ 代码执行完成，最新截图已生成 (screenshot_id=${screenshotId}, ~${sizeKB}KB, 文件名=${savedFileName})\n⚠️重要：这是最新的实时截图！下次需要查看画面状态时，必须重新调用 blender_get_screenshot_of_area_as_image 获取最新截图，切勿读取工作区中的历史截图文件！`
				: `✅ 代码执行完成，最新截图已生成 (screenshot_id=${screenshotId}, ~${sizeKB}KB)\n⚠️重要：下次需要查看画面状态时，必须重新调用截图工具获取最新画面！`
			content.push({ type: 'text', text: summary })
			content.push({
				type: 'image',
				data: String(result.image_base64),
				mimeType: result.mime_type || 'image/png'
			})
			const display = { ...result }
			display.image_base64 = `[base64 image, ${sizeKB}KB]`
			const resultStr = JSON.stringify(display, null, 2)
			return {
				content,
				text: text ? `${text}\n${summary}\n${resultStr}` : `${summary}\n${resultStr}`,
				savedPath,
				url: cacheBustUrl,
				savedFileName,
				screenshotId
			}
		}

		if (result !== undefined) {
			const display = { ...result }
			if (display.image_base64) {
				display.image_base64 = `[base64 PNG, ${display.image_base64.length} chars]`
			}
			const resultStr = typeof display === 'string' ? display : JSON.stringify(display, null, 2)
			text = text ? `${text}\n${resultStr}` : resultStr
		}
		return text || '代码执行完成（无输出）'
	}

	async _executeScreenshotCode(code) {
		const response = await this._executeRaw(code)
		if (response.status === 'error') {
			throw new Error(response.message || '截图失败')
		}
		const result = response.result
		if (result && result.status === 'error') {
			throw new Error(result.message || '截图失败')
		}
		if (result && result.image_base64) {
			const areaType = result.area_type || 'window'
			const sizeKB = Math.round((result.image_base64.length * 3) / 4 / 1024)
			const screenshotId = result.screenshot_id || String(Date.now())

			let saveResult = null
			let savedPath = null
			let savedUrl = null
			let savedFileName = null
			if (this._workspaceContext) {
				try {
					const workspace = getBlenderWorkspace()
					saveResult = await workspace.saveScreenshot(
						this._workspaceContext.projectRoot,
						this._workspaceContext.nodeId,
						result.image_base64,
						'image/png',
						screenshotId
					)
					if (saveResult.ok) {
						savedPath = saveResult.absolutePath
						savedUrl = saveResult.url
						savedFileName = saveResult.fileName
						logger.info(
							`[BlenderMcpService] Screenshot auto-saved to workspace: ${savedPath}, screenshotId=${screenshotId}, fileName=${savedFileName}`
						)
					} else {
						logger.warn(`[BlenderMcpService] Failed to auto-save screenshot: ${saveResult.error}`)
					}
				} catch (saveErr) {
					logger.warn(`[BlenderMcpService] Error auto-saving screenshot: ${saveErr.message}`)
				}
			}

			const textMsg = savedPath
				? `✅ ${areaType}最新截图已生成 (screenshot_id=${screenshotId}, ~${sizeKB}KB, 文件名=${savedFileName})\n⚠️重要：这是最新的实时截图！下次需要查看画面状态时，必须【重新调用截图工具】获取最新画面，绝不能读取screenshots目录中的历史截图文件！`
				: `✅ ${areaType}最新截图已生成 (screenshot_id=${screenshotId}, ~${sizeKB}KB)\n⚠️重要：下次需要查看画面状态时，必须重新调用截图工具！`

			return {
				content: [
					{ type: 'text', text: textMsg },
					{ type: 'image', data: result.image_base64, mimeType: 'image/png' }
				],
				text: textMsg,
				savedPath,
				savedUrl,
				savedFileName,
				screenshotId,
				areaType,
				sizeKB
			}
		}
		let text = ''
		if (response.stdout) text += response.stdout
		if (response.stderr) text += `\n[stderr]\n${response.stderr}`
		if (result) {
			if (result.message) throw new Error(result.message)
			text += (text ? '\n' : '') + JSON.stringify(result, null, 2)
		}
		return text || '截图失败'
	}

	_requireWorkspaceContext() {
		if (!this._workspaceContext) {
			throw new Error('工作区未初始化。请确保在开始对话前已初始化Blender工作区。')
		}
		return this._workspaceContext
	}

	async _readWorkspaceImage(imagePath) {
		const ctx = this._requireWorkspaceContext()
		const workspace = getBlenderWorkspace()
		const result = workspace.readWorkspaceImage(ctx.projectRoot, ctx.nodeId, imagePath)
		if (!result.ok) {
			throw new Error(result.error || '读取图片失败')
		}
		const sizeKB = Math.round(result.size / 1024)
		const content = []
		let textMsg = `已读取图片: ${result.fileName || result.absolutePath} (~${sizeKB}KB)`
		if (result.warning) {
			textMsg = result.warning + '\n' + textMsg
		}
		content.push({ type: 'text', text: textMsg })
		content.push({ type: 'image', data: result.base64, mimeType: result.mimeType })
		return {
			content,
			text: textMsg,
			savedPath: result.absolutePath,
			url: result.cacheBustUrl,
			warning: result.warning
		}
	}

	async _listWorkspaceImages() {
		const ctx = this._requireWorkspaceContext()
		const workspace = getBlenderWorkspace()
		const result = workspace.listWorkspaceImages(ctx.projectRoot, ctx.nodeId)
		if (!result.ok) {
			throw new Error(result.error || '列出图片失败')
		}
		const lines = [`工作区路径: ${result.workspacePath}`, '']
		lines.push(`共找到 ${result.images.length} 张图片:`)
		for (const img of result.images) {
			lines.push(`- [${img.category}] ${img.fileName} (${Math.round(img.size / 1024)}KB)`)
			lines.push(`  相对路径: ${img.relativePath}`)
			lines.push(`  绝对路径: ${img.absolutePath}`)
		}
		if (result.images.length === 0) {
			lines.push('(暂无图片)')
		}
		lines.push('')
		lines.push('提示: 使用 blender_read_workspace_image 工具传入相对路径即可查看对应图片。')
		const text = lines.join('\n')
		return { content: [{ type: 'text', text }], text }
	}

	async saveReferenceImages(references) {
		const ctx = this._requireWorkspaceContext()
		const workspace = getBlenderWorkspace()
		const saved = []
		const refs = Array.isArray(references) ? references : []
		for (let i = 0; i < refs.length; i++) {
			const ref = refs[i]
			if (!ref || !ref.base64) continue
			const fileName = ref.fileName || `reference_${i + 1}`
			const mimeType = ref.mimeType || 'image/png'
			const saveResult = await workspace.saveReferenceImage(
				ctx.projectRoot,
				ctx.nodeId,
				ref.base64,
				fileName,
				mimeType
			)
			if (saveResult.ok) {
				saved.push({
					fileName: saveResult.fileName,
					absolutePath: saveResult.absolutePath,
					relativePath: path.join('references', saveResult.fileName),
					size: saveResult.size,
					sourceAlias: ref.sourceAlias || ''
				})
			}
		}
		return { ok: true, saved, workspacePath: this.getWorkspacePath() }
	}

	getWorkspacePath() {
		if (!this._workspaceContext) return null
		const { projectRoot, nodeId } = this._workspaceContext
		const workspace = getBlenderWorkspace()
		const wp = path.resolve(projectRoot, 'Content', 'agent', nodeId.replace(/[^a-zA-Z0-9_-]/g, '_'))
		return wp
	}

	async disconnectMcp() {
		this._setStatus('disconnecting')
		logger.info('[BlenderMcpService] Disconnecting...')
		this.client = null
		this._setStatus('disconnected')
		return { disconnected: true }
	}

	mountTools() {
		if (this.status !== 'connected') {
			return {
				ok: false,
				ready: false,
				error: 'Blender未连接，请先连接Blender',
				status: this.status,
				availableToolCount: 0,
				missingToolCount: -1,
				missingTools: []
			}
		}
		this._registerTools()
		this._setStatus('connected', {
			tools: this._registeredToolNames,
			toolCount: this._registeredToolNames.length
		})
		const checkResult = this.checkToolsReady()
		logger.info(
			`[BlenderMcpService] mountTools: ${checkResult.availableToolCount}/${checkResult.expectedToolCount} tools ready`
		)
		return {
			ok: true,
			...checkResult
		}
	}

	getBlenderSystemPrompt() {
		let prompt = `你是一个Blender 3D控制助手，通过官方Blender MCP协议连接到正在运行的Blender实例。你可以调用多种专用工具来查看和修改3D场景。

## 核心工具
- **blender_execute_blender_code**: 执行任意bpy Python代码。当其他专用工具无法满足需求时使用此工具。代码执行后必须设置result字典。

## 场景信息工具
- **blender_get_objects_summary**: 获取集合层级树和所有对象列表、材质/相机/灯光名称。开始操作前优先调用。
- **blender_get_object_detail_summary**: 获取指定对象的完整详细信息（变换、修改器、约束、材质、可见性、集合等）。修改对象后，优先用此工具验证参数，比截图更高效。
- **blender_get_screenshot_of_window_as_json**: 获取窗口布局、区域分布、活动对象、选中对象的JSON描述。
- **blender_get_blendfile_summary_datablocks**: 获取数据块统计、渲染引擎、工作区信息。
- **blender_get_blendfile_summary_path_info**: 获取文件路径、保存状态、备份信息。
- **blender_get_blendfile_summary_missing_files**: 检查缺失的外部文件引用。
- **blender_get_blendfile_summary_of_linked_libraries**: 查看链接库依赖。
- **blender_get_blendfile_summary_usage_guess**: 猜测文件用途（建模/渲染/动画等评分）。

## 截图工具（按需使用，避免频繁截图浪费token）
- **blender_get_screenshot_of_area_as_image**: 截取指定区域最新截图（默认VIEW_3D），返回base64 PNG。
- **blender_get_screenshot_of_window_as_image**: 截取整个Blender窗口最新截图。

📸 **截图策略（智能使用，节省token）**：
1. **不需要截图的场景**（优先使用结构化工具验证）：
   - 查询类操作（get_objects_summary、get_object_detail_summary等）
   - 简单参数修改、对象创建/删除等操作：用get_object_detail_summary验证即可
   - 导航操作（jump_to_*系列工具）
   - 批量连续操作：完成所有相关步骤后再统一截图验证一次
   - 导入模型：导入过程不需要截图，可在全部导入完成后截图确认
2. **需要截图的场景**：
   - 用户明确要求"看看效果"、"截图看看"、"现在什么样"
   - 完成整个任务的最终验证
   - 操作结果不确定、需要视觉确认布局/位置/外观
   - 遇到错误需要调试时
   - 涉及材质、灯光、渲染效果等视觉相关调整
3. **重要规则**：
   - blender_read_workspace_image 仅用于查看references目录中的参考图片
   - 不要使用blender_read_workspace_image查看screenshots目录（历史截图）
   - 结构化工具（get_object_detail_summary等）能验证的，优先用结构化工具，不要用截图

## ⚠️ Blender 5.1 版本专属注意事项（极其重要，不要用旧API）

你运行在 **Blender 5.1** 环境中，大量API相对于3.x/4.x版本已变更。以下是高频错误清单：

### 渲染引擎枚举（必须使用正确值）
- ✅ 正确：\`bpy.context.scene.render.engine = 'BLENDER_EEVEE'\`
- ❌ 错误：\`'BLENDER_EEVEE_NEXT'\`（已废弃，不存在）
- ❌ 错误：不要直接设置 \`eevee.use_bloom\`，EEVEE设置在5.1中已重构路径，设置前应先查询属性是否存在

### 颜色值（必须4通道RGBA）
- ✅ 正确：所有颜色输入（Base Color/Emission等）必须用4通道：\`(r, g, b, 1.0)\`
- ❌ 错误：3通道RGB \`(1, 0, 0)\` 会报错 "sequences of dimension 0 should contain 4 items"

### 旋转模式枚举
- ✅ 正确：\`obj.rotation_mode = 'XYZ'\`
- ❌ 错误：\`'EULER_XYZ'\`（不存在）

### bmesh API使用
- ✅ 正确：\`bm = bmesh.new(); bm.from_mesh(mesh)\` 或编辑模式下 \`bm = bmesh.from_edit_mesh(mesh)\`
- ❌ 错误：\`bmesh.from_mesh(mesh)\`（这是模块级函数，不存在）

### 视图覆盖层属性改名
- ❌ \`overlay.show_bounds\` → ✅ \`overlay.show_object_bounds\`
- ❌ \`overlay.show_camera\` 等属性在5.1中已改名，使用前先检查 \`hasattr(overlay, 'property_name')\`

### 对象操作安全检查
- 设置原点前必须检查类型：\`if obj.type != 'CAMERA'\` 才能调用 \`bpy.ops.object.origin_set()\`，相机会报错
- 链接到集合前检查：\`if obj.name not in col.objects: col.objects.link(obj)\`
- 访问对象前检查：\`obj = bpy.data.objects.get("Name")\`，判断 \`if obj is None\`
- 创建节点前检查节点类型是否存在，Blender 5.1中部分几何节点ID已变更或移除
- 访问节点输入输出前检查：\`if node.inputs.get("Name") is not None\`

### HDRI/枚举值
- HDRI枚举需要写完整文件名（如 \`"city.exr"\`），不要只写 \`"city"\`

### 材质设置（Blender 5.x已变更）
- ❌ \`material.shadow_method\` 属性在Blender 5.x中已移除/重构，不要设置
- ❌ Principled BSDF节点：不要使用 \`bsdf.inputs["Emission"]\`，Emission在Blender 5.x中需要添加独立的"Emission"节点并连接到Material Output的Surface端口

### 3D视图背景图（API已重构）
- ❌ \`space.background_images\` - 已移除，不要遍历
- ❌ \`space.show_background_images\` - 已移除/改名
- 背景图相关操作如果不确定，先查询可用属性

### 错误记忆规则（避免重复犯同样错误）
- **同一个API错误绝对不要犯第二次！** 如果某个属性/方法报错了，记住这个错误，换一种方式实现，不要重复尝试相同写法
- 如果不确定API是否存在，先用极小代码段测试 \`hasattr(obj, 'property')\` 再使用
- 代码报错时，先仔细阅读stderr错误信息，根据错误信息直接修正，不要盲目重试

## 🛡️ 安全操作铁则（违反将导致严重问题）

### 删除操作（极度谨慎）
1. **永远不要执行 \`bpy.ops.object.delete()\` 不带选择**（可能删除所有对象）
2. **永远不要执行 \`bpy.data.objects.remove(obj)\` 除非用户明确要求删除**
3. **优先使用隐藏 \`obj.hide_set(True)\` 代替删除，可恢复**
4. **高风险操作前先调用：\`bpy.ops.ed.undo_push(message="Before AI Operation")\`**，用户出错可按Ctrl+Z撤销
5. **每次只修改一个对象/一个参数**，验证后再继续

### 通用安全编码规范
1. 任何操作前先检查对象是否存在：\`obj = bpy.data.objects.get("Name"); if obj is None: return error\`
2. 任何属性设置前先检查属性是否存在：\`if hasattr(obj, 'property_name')\`
3. 访问集合前检查索引/键是否存在：\`if 0 < len(col) or "key" in col\`
4. 不要批量删除/修改用户未明确要求的内容
5. 如果不确定API是否存在，先用小代码段测试属性是否存在，再执行完整操作
6. **同一个错误不要重复犯**：如果代码报错了，分析错误原因后换方法，不要反复尝试相同写法

## 📸 截图节流规则（强制执行，避免token浪费）
1. **两次截图之间至少间隔30秒**，除非用户明确要求"现在截图看看"
2. **代码错误时先看stderr错误信息**，不要立即截图 - 根据错误信息直接修正代码
3. **连续2次修正后仍有问题时才截图**调试
4. **批量查询/连续操作期间不截图**：先完成所有计划的修改步骤，最后统一截图验证一次
5. 如果30秒内已经截过图了，不要重复截图

## bpy API快速参考（避免写错API）

### 对象访问与选择
\`\`\`python
import bpy

obj = bpy.data.objects.get("ObjectName")
if obj is None:
    result = {"status": "error", "message": "Object not found"}
else:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
\`\`\`

### 变换操作
\`\`\`python
obj.location = (x, y, z)
obj.rotation_euler = (rx, ry, rz)
obj.scale = (sx, sy, sz)

is_visible = obj.visible_get()
obj.hide_set(False)
obj.hide_viewport = False
\`\`\`

### 视图操作（需要在VIEW_3D上下文执行）
\`\`\`python
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        for region in area.regions:
            if region.type == 'WINDOW':
                with bpy.context.temp_override(area=area, region=region):
                    bpy.ops.view3d.view_selected()
                break
        break
\`\`\`

### 上下文覆盖（Blender 3.2+标准方式）
\`\`\`python
with bpy.context.temp_override(window=win, area=area, region=region):
    bpy.ops.some_operator()
\`\`\`

### 模型导入
\`\`\`python
bpy.ops.import_scene.gltf(filepath=path)
bpy.ops.import_scene.fbx(filepath=path)
bpy.ops.wm.obj_import(filepath=path)
bpy.ops.wm.stl_import(filepath=path)
\`\`\`

### 结果返回要求
- 代码执行后**必须**设置result字典变量
- 成功时：result = {"status": "ok", ...其他数据}
- 失败时：result = {"status": "error", "message": "错误描述"}

## 导航工具
- **blender_jump_to_tab_by_name**: 按名称切换工作区标签（Modeling/Rendering/Animation等）。
- **blender_jump_to_tab_by_space_type**: 按空间类型切换工作区。
- **blender_jump_to_view3d_object_by_name**: 在3D视口中选中并框选聚焦到指定对象（自动显示隐藏对象）。
- **blender_jump_to_view3d_object_data_by_name**: 按数据块名称聚焦对象。

## 其他
- **blender_import_model**: 导入3D模型文件（.glb/.gltf/.fbx/.obj/.stl）。
- **blender_read_workspace_image**: 仅用于读取references目录中的参考图片。
- **blender_list_workspace_images**: 列出工作区图片文件。

## 使用规则
1. **操作前先调用 blender_get_objects_summary 了解场景**
2. **不要猜测对象名称**，先用工具获取真实名称
3. **复杂操作拆分步骤**，每次少量代码
4. **验证策略**：优先用结构化工具验证参数，视觉效果再用截图验证
5. **截图节流**：两次截图间隔至少30秒，连续操作完成后再统一截图，代码错误先看stderr
6. **避免N+1查询**：先从get_objects_summary获取足够信息（name/type/location），不要逐个查询所有对象详情
7. **只查询需要修改的对象**：只对你要操作的对象调用get_object_detail_summary，不要查询所有对象
8. **安全第一**：所有操作遵循安全编码规范，高风险操作前先push undo点
9. **Blender 5.1**：API与旧版本不同，遇到不确认的属性先hasattr检查，不要重复犯同样错误
10. **错误记忆**：同一个API错误不要犯第二次，报错后换方法实现
11. 代码执行后必须设置result = {...}字典
12. 回复用户使用中文`
		if (this._registeredToolNames.length > 0) {
			prompt += '\n\n## 当前已注册工具\n'
			prompt += this._registeredToolNames.map((t) => `- ${t}`).join('\n')
		}
		return prompt
	}

	getBlenderToolNames() {
		return [...this._registeredToolNames]
	}

	async checkStatus(_ctx, payload) {
		const probeHost = payload?.host ?? payload?.mcpHost
		const probePortRaw = payload?.port ?? payload?.mcpPort

		if (probeHost || probePortRaw) {
			const probePort = Number(probePortRaw)
			const targetHost = probeHost || this.host || DEFAULT_HOST
			const targetPort =
				!Number.isNaN(probePort) && probePort > 0 && probePort <= 65535
					? probePort
					: this.port || DEFAULT_PORT

			if (this.isConnected() && targetHost === this.host && targetPort === this.port) {
				return this.getMcpStatus()
			}

			try {
				const probeClient = new BlenderTcpClient(targetHost, targetPort)
				const ping = await probeClient.ping()
				if (ping.ok) {
					return {
						ok: true,
						status: 'disconnected',
						host: targetHost,
						port: targetPort,
						addonListening: true,
						blenderRunning: true,
						hasBlender: true,
						hasAddon: true,
						message: `Blender MCP插件在 ${targetHost}:${targetPort} 上监听中，可连接`
					}
				}
				return {
					ok: false,
					status: 'addon-not-started',
					host: targetHost,
					port: targetPort,
					addonListening: false,
					error: ping.error || 'MCP插件未在该端口响应'
				}
			} catch (err) {
				let status = 'addon-not-started'
				let msg = err.message
				if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('连接被拒绝'))) {
					status = 'addon-not-started'
				}
				return {
					ok: false,
					status,
					host: targetHost,
					port: targetPort,
					addonListening: false,
					error: msg
				}
			}
		}

		return this.getMcpStatus()
	}

	async getMcpStatus() {
		const toolsCheck = this.checkToolsReady()
		return {
			ok: this.status === 'connected',
			status: this.status,
			host: this.host,
			port: this.port,
			tools: this._registeredToolNames,
			toolCount: this._registeredToolNames.length,
			toolsReady: toolsCheck.ready,
			availableToolCount: toolsCheck.availableToolCount,
			missingToolCount: toolsCheck.missingToolCount,
			missingTools: toolsCheck.missingTools
		}
	}

	async callTool(_ctx, payload) {
		const { tool, args, toolName } = payload || {}
		const name = tool || toolName
		if (!name) throw new Error('Tool name is required')
		const prefixedName = name.startsWith(BLENDER_TOOL_PREFIX)
			? name
			: `${BLENDER_TOOL_PREFIX}${name}`
		return await getToolExecutor().callTool(prefixedName, args || {}, { skipFrontend: true })
	}

	async importModelViaBridge(fps) {
		const code = buildImportModelCode(fps)
		const cmdResult = await sendCommandToBridge(code, BRIDGE_COMMAND_TIMEOUT_MS)
		if (!cmdResult.ok) {
			logger.error(`[BlenderBridge] Command execution failed: ${cmdResult.error}`)
			if (cmdResult.traceback) logger.error(`[BlenderBridge] Traceback:\n${cmdResult.traceback}`)
			return { ok: false, error: cmdResult.error, traceback: cmdResult.traceback }
		}
		const pyResult = cmdResult.result
		logger.info(
			`[BlenderBridge] Python result status: ${pyResult?.status}, results count: ${pyResult?.results?.length || 0}`
		)
		if (pyResult?.fatal_error) {
			logger.error(`[BlenderBridge] Fatal error: ${pyResult.fatal_error}`)
			if (pyResult.traceback) logger.error(`[BlenderBridge] Traceback:\n${pyResult.traceback}`)
		}
		const allResults = pyResult?.results || []
		for (const r of allResults) {
			if (r && r.status !== 'ok') {
				logger.warn(`[BlenderBridge] Import failed for ${r.path}: ${r.message}`)
				if (r.traceback) logger.warn(`[BlenderBridge] Traceback for ${r.path}:\n${r.traceback}`)
			}
		}
		if (!pyResult || typeof pyResult !== 'object') {
			return {
				ok: true,
				imported: fps.map((p) => ({ path: p, status: 'ok' })),
				count: fps.length,
				mode: 'bridge'
			}
		}
		if (pyResult.status === 'error') {
			const firstErr = (pyResult.results || [])[0]
			let errMsg = pyResult.message || pyResult.fatal_error || '模型导入失败'
			if (firstErr?.message) errMsg = firstErr.message
			if (firstErr?.traceback) {
				logger.error(`[BlenderBridge] First error traceback:\n${firstErr.traceback}`)
				errMsg += '\n\n[Blender错误详情]\n' + firstErr.traceback.split('\n').slice(-5).join('\n')
			}
			if (pyResult.traceback) errMsg += '\n' + pyResult.traceback
			return { ok: false, error: errMsg, results: pyResult.results || [] }
		}
		const imported = (pyResult.results || []).filter((r) => r && r.status === 'ok')
		const failed = (pyResult.results || []).filter((r) => r && r.status !== 'ok')
		if (!imported.length) {
			const firstErr = failed[0]
			let errMsg = firstErr?.message || '模型导入失败'
			if (firstErr?.traceback) {
				errMsg += '\n\n[Blender错误详情]\n' + firstErr.traceback.split('\n').slice(-8).join('\n')
			}
			return { ok: false, error: errMsg, results: pyResult.results || [] }
		}
		return {
			ok: true,
			count: imported.length,
			total: pyResult.total || fps.length,
			errorCount: failed.length,
			results: pyResult.results || [],
			imported: imported.map((r) => ({
				path: r.path,
				name: r.imported,
				newObjects: r.new_objects || [],
				count: r.count || 0
			})),
			mode: 'bridge'
		}
	}

	async importModel(_ctx, payload) {
		const { filePath, file_path, filePaths, blenderPath: payloadBlenderPath } = payload || {}
		const rawList =
			Array.isArray(filePaths) && filePaths.length
				? filePaths
				: filePath || file_path
					? [filePath || file_path]
					: []
		const rawFps = rawList.map((p) => String(p || '').trim()).filter(Boolean)
		if (!rawFps.length) {
			throw new Error('filePath is required for importModel')
		}

		const fps = rawFps.map((p) => resolveToAbsoluteFilePath(p))

		logger.info(`[BlenderImport] Attempting to import ${fps.length} model(s)...`)
		for (let i = 0; i < fps.length; i++) {
			logger.info(`[BlenderImport]   [${i}] ${fps[i]} (raw: ${rawFps[i]})`)
		}

		const missing = fps.filter((p) => !fileExists(p))
		if (missing.length) {
			logger.warn(`[BlenderImport] Files not found on disk: ${missing.join(', ')}`)
		}

		const hintPath = payloadBlenderPath || undefined
		let blenderExe = await findBlenderExecutable(hintPath)

		await ensureBridgeInstalled(blenderExe)

		const blenderIsRunning = await detectRunningBlenderProcess()

		if (blenderIsRunning) {
			logger.info(`[BlenderImport] Detected running blender.exe, checking bridge...`)

			const aliveCheckStart = Date.now()
			let bridgeAlive = isBridgeAlive()
			while (!bridgeAlive && Date.now() - aliveCheckStart < 2000) {
				await new Promise((r) => setTimeout(r, 300))
				bridgeAlive = isBridgeAlive()
			}

			if (bridgeAlive) {
				logger.info(`[BlenderImport] Bridge alive, sending import to running Blender.`)
				try {
					const bridgeResult = await this.importModelViaBridge(fps)
					if (bridgeResult.ok) {
						logger.info(
							`[BlenderImport] Imported ${bridgeResult.count}/${fps.length} model(s) into RUNNING Blender via bridge.`
						)
						return bridgeResult
					}
					logger.warn(`[BlenderImport] Bridge import failed: ${bridgeResult.error}`)
					return bridgeResult
				} catch (bridgeErr) {
					logger.warn(`[BlenderImport] Bridge communication error: ${bridgeErr.message}`)
					return { ok: false, error: `与Blender桥接通信失败：${bridgeErr.message}` }
				}
			} else {
				return {
					ok: false,
					error:
						'检测到Blender已在运行，但桥接未激活。\n\nDVStudio已自动安装桥接脚本，请重启Blender后重新点击导入（仅首次需要）。\n\n重启后，模型将直接导入到当前打开的Blender窗口中，无需配置任何端口或插件。',
					needRestart: true
				}
			}
		}

		logger.info(`[BlenderImport] No running blender.exe detected, launching Blender...`)
		if (!blenderExe) {
			blenderExe = await findBlenderExecutable()
		}
		if (!blenderExe) {
			return {
				ok: false,
				error:
					'未找到Blender可执行文件。请在Blender节点的"Blender路径"中指定blender.exe路径，或先安装Blender后重试。'
			}
		}

		const cliResult = await runCliImport(blenderExe, fps)
		if (cliResult.ok) {
			cliResult.mode = 'cli'
		}
		return cliResult
	}
}

const blenderMcpService = new BlenderMcpService()
export default blenderMcpService

export function connectBlenderMcp(port, host) {
	return blenderMcpService.connectMcp(port, host)
}
export function disconnectBlenderMcp() {
	return blenderMcpService.disconnectMcp()
}
export function getBlenderMcpStatus() {
	return blenderMcpService.getStatus()
}
export function isBlenderMcpConnected() {
	return blenderMcpService.isConnected()
}
export function getBlenderSystemPrompt() {
	return blenderMcpService.getBlenderSystemPrompt()
}
export function getBlenderToolNames() {
	return blenderMcpService.getBlenderToolNames()
}
export function setBlenderWorkspaceContext(projectRoot, nodeId) {
	return blenderMcpService.setWorkspaceContext(projectRoot, nodeId)
}
export function getBlenderWorkspaceContext() {
	return blenderMcpService.getWorkspaceContext()
}
export function saveBlenderReferenceImages(references) {
	return blenderMcpService.saveReferenceImages(references)
}
export function getBlenderNodeWorkspacePath() {
	return blenderMcpService.getWorkspacePath()
}
export function onBlenderMcpStatusChanged(listener) {
	blenderMcpService.on('status-changed', listener)
	return () => blenderMcpService.removeListener('status-changed', listener)
}
