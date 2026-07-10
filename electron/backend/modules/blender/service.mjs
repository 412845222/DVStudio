import { EventEmitter } from 'events';
import net from 'net';
import { BrowserWindow } from 'electron';
import logger from '../../core/logger.mjs';
import { getToolExecutor } from '../mcp/toolExecutor.mjs';

const BLENDER_TOOL_PREFIX = 'blender_';
const BLENDER_STATUS_CHANGED_CHANNEL = 'dweb:blender:mcp:status-changed';
const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 9876;
const SOCKET_TIMEOUT_MS = 180000;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
const IMAGE_SIZE_LIMIT = 80 * 1024;
const IMAGE_MAX_DIMENSION = 640;

function broadcastStatusToWindows(payload) {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) win.webContents.send(BLENDER_STATUS_CHANGED_CHANNEL, payload);
      } catch { /* window may be closing */ }
    }
  } catch (err) {
    logger.debug(`[BlenderMcpService] Failed to broadcast status: ${err.message}`);
  }
}

function escStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const IMAGE_DOWNSCALE_CODE = `
def _downscale_image(tmpdir, filepath, size_limit, max_dimension, tolerance=0):
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
    if max(w, h) > max_dimension:
        scale = max_dimension / max(w, h)
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
        cur_w, cur_h = new_w, new_h
        if len(data) <= size_limit:
            break
    
    im.free()
    return data
`;

function buildGetObjectsSummary() {
  return `import bpy

def _walk_collection_tree(coll, visited, depth=0):
    if coll.name in visited:
        return None
    visited.add(coll.name)
    info = {
        "name": coll.name,
        "depth": depth,
        "objects": [obj.name for obj in coll.objects],
        "children": [],
    }
    for child in coll.children:
        if child.name not in visited:
            child_info = _walk_collection_tree(child, visited, depth + 1)
            if child_info:
                info["children"].append(child_info)
    return info

scene = bpy.context.scene
view_layer = bpy.context.view_layer

all_objects = []
for obj in scene.objects:
    obj_info = {
        "name": obj.name,
        "type": obj.type,
        "location": list(obj.location),
        "visible": obj.visible_get(),
        "selected": obj.select_get(),
    }
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
lights = [l.name for l in bpy.data.lights]

result = {
    "scene_name": scene.name,
    "objects_count": len(all_objects),
    "objects": all_objects,
    "collections": collections_tree,
    "materials": materials,
    "cameras": cameras,
    "lights": lights,
    "active_object": bpy.context.active_object.name if bpy.context.active_object else None,
    "selected_objects": [o.name for o in bpy.context.selected_objects],
    "mode": bpy.context.mode,
}`;
}

function buildGetObjectDetailSummary(objectName) {
  const n = escStr(objectName);
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
    }`;
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
}`;
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
}`;
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
}`;
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
}`;
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

result = {"status": "ok", "usage_guesses": usages}`;
}

function buildGetScreenshotOfAreaAsImage(areaType, sizeLimit) {
  const at = escStr(areaType || 'VIEW_3D');
  const limit = Number(sizeLimit) || IMAGE_SIZE_LIMIT;
  const maxDim = IMAGE_MAX_DIMENSION;
  return `import bpy, tempfile, os, base64
${IMAGE_DOWNSCALE_CODE}
_area_type = "${at}"
if bpy.app.background:
    result = {"status": "error", "message": "Screenshots not available in background mode"}
elif bpy.context.window is None:
    result = {"status": "error", "message": "No active window"}
else:
    target_area = None
    for area in bpy.context.screen.areas:
        if area.type == _area_type:
            target_area = area
            break
    if target_area is None:
        available = [a.type for a in bpy.context.screen.areas]
        result = {"status": "error", "message": f"No area of type {_area_type!r} found. Available: {available}"}
    else:
        with tempfile.TemporaryDirectory(prefix="blmcp_screenshot_") as tmpdir:
            fp = os.path.join(tmpdir, "screenshot.png")
            try:
                with bpy.context.temp_override(area=target_area):
                    bpy.ops.screen.screenshot_area(filepath=fp)
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
                    }`;
}

function buildGetScreenshotOfWindowAsImage(sizeLimit) {
  const limit = Number(sizeLimit) || IMAGE_SIZE_LIMIT;
  const maxDim = IMAGE_MAX_DIMENSION;
  return `import bpy, tempfile, os, base64
${IMAGE_DOWNSCALE_CODE}
if bpy.app.background:
    result = {"status": "error", "message": "Screenshots not available in background mode"}
elif bpy.context.window is None:
    result = {"status": "error", "message": "No active window"}
else:
    with tempfile.TemporaryDirectory(prefix="blmcp_screenshot_") as tmpdir:
        fp = os.path.join(tmpdir, "screenshot.png")
        try:
            bpy.ops.screen.screenshot(filepath=fp)
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
                }`;
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
    }`;
}

function buildJumpToTabByName(workspaceName) {
  const n = escStr(workspaceName);
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
        result = {"status": "ok", "workspace": ws.name}`;
}

function buildJumpToTabBySpaceType(spaceType, allowEdits) {
  const st = escStr(spaceType);
  const ae = allowEdits ? 'True' : 'False';
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
        result = {"status": "error", "message": f"No workspace with space type {_space_type!r} found", "available_space_types": available}`;
}

function buildJumpToView3dObjectByName(objectName, allowEdits) {
  const n = escStr(objectName);
  const ae = allowEdits ? 'True' : 'False';
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
        result = {"status": "ok", "object": _obj_name, "type": obj.type, "location": list(obj.location), "message": msg}`;
}

function buildJumpToView3dObjectDataByName(dataName, allowEdits) {
  const n = escStr(dataName);
  const ae = allowEdits ? 'True' : 'False';
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
        result = {"status": "ok", "object": target.name, "data_name": _data_name, "type": target.type, "location": list(target.location), "message": msg}`;
}

function buildImportModelCode(filePath) {
  const fp = escStr(filePath);
  return `import bpy, os

fpath = "${fp}"
if not os.path.exists(fpath):
    result = {"status": "error", "message": f"File not found: {fpath}"}
else:
    ext = os.path.splitext(fpath)[1].lower()
    before = set(bpy.context.scene.objects)
    ctx_window = None
    ctx_area = None
    ctx_region = None
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                for region in area.regions:
                    if region.type == 'WINDOW':
                        ctx_window = window
                        ctx_area = area
                        ctx_region = region
                        break
                if ctx_area:
                    break
        if ctx_area:
            break
    try:
        def _do_import():
            if ext in ('.glb', '.gltf'):
                bpy.ops.import_scene.gltf(filepath=fpath)
            elif ext == '.fbx':
                bpy.ops.import_scene.fbx(filepath=fpath)
            elif ext == '.obj':
                bpy.ops.wm.obj_import(filepath=fpath)
            elif ext == '.stl':
                bpy.ops.wm.stl_import(filepath=fpath)
            else:
                result = {"status": "error", "message": f"Unsupported format: {ext}"}
                return False
            return True
        ok = False
        if ctx_area and ctx_region:
            with bpy.context.temp_override(window=ctx_window, area=ctx_area, region=ctx_region):
                ok = _do_import()
        else:
            ok = _do_import()
        if ok is not False and "status" not in result:
            after = set(bpy.context.scene.objects)
            new_objs = [o.name for o in (after - before)]
            result = {"status": "ok", "imported": os.path.basename(fpath), "format": ext, "new_objects": new_objs, "count": len(new_objs)}
    except Exception as e:
        result = {"status": "error", "message": f"Import failed: {str(e)}"}`;
}

class BlenderTcpClient {
  constructor(host, port) {
    this.host = host;
    this.port = Number(port);
  }

  async sendCommand(commandType, params = {}) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let buffer = Buffer.alloc(0);
      let resolved = false;
      let connectTimeout = null;

      const cleanup = () => {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        try { socket.destroy(); } catch {}
      };

      const CONNECT_TIMEOUT_MS = 8000;
      socket.setTimeout(SOCKET_TIMEOUT_MS);

      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`Blender连接超时（${this.host}:${this.port}），请确认Blender已启动且MCP插件在该端口上监听`));
        }
      });

      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          let msg = `Blender连接失败（${this.host}:${this.port}）: ${err.message}`;
          if (err.code === 'ECONNREFUSED') {
            msg = `无法连接到Blender（${this.host}:${this.port}）：连接被拒绝。请确认：\n1. Blender已启动\n2. MCP插件已启用并在端口${this.port}上监听\n3. 端口号与Blender插件设置一致`;
          } else if (err.code === 'ECONNRESET') {
            msg = `Blender连接被重置（${this.host}:${this.port}），MCP插件可能未正确启动`;
          } else if (err.code === 'ENOTFOUND') {
            msg = `主机名解析失败（${this.host}）`;
          }
          reject(new Error(msg));
        }
      });

      socket.on('close', () => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Blender连接已关闭（${this.host}:${this.port}）`));
        }
      });

      socket.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);
        if (buffer.length > MAX_RESPONSE_BYTES) {
          resolved = true;
          cleanup();
          reject(new Error('Blender响应数据过大（超过50MB）'));
          return;
        }
        const nullIdx = buffer.indexOf(0);
        if (nullIdx !== -1) {
          const msgBytes = buffer.subarray(0, nullIdx);
          try {
            const response = JSON.parse(msgBytes.toString('utf-8'));
            resolved = true;
            cleanup();
            resolve(response);
          } catch (parseErr) {
            resolved = true;
            cleanup();
            reject(new Error(`Blender响应解析失败: ${parseErr.message}`));
          }
        }
      });

      logger.debug(`[BlenderTcpClient] Connecting to ${this.host}:${this.port} for command: ${commandType}`);

      connectTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`Blender连接超时（${this.host}:${this.port}，${CONNECT_TIMEOUT_MS}ms），无法建立TCP连接`));
        }
      }, CONNECT_TIMEOUT_MS);

      socket.connect(this.port, this.host, () => {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        logger.debug(`[BlenderTcpClient] Connected to ${this.host}:${this.port}, sending command: ${commandType}`);
        const request = { type: commandType, ...params, strict_json: false };
        const payload = Buffer.from(JSON.stringify(request) + '\0', 'utf-8');
        socket.write(payload);
      });
    });
  }

  async executeCode(code) {
    return await this.sendCommand('execute', { code });
  }

  async ping() {
    try {
      const response = await this.executeCode(
        'import bpy\nresult = {"status": "ok", "blender_version": bpy.app.version_string}'
      );
      if (response.status === 'error') {
        return { ok: false, error: response.message || 'Unknown error' };
      }
      return { ok: true, response };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

class BlenderMcpService extends EventEmitter {
  constructor() {
    super();
    this.status = 'disconnected';
    this.host = DEFAULT_HOST;
    this.port = DEFAULT_PORT;
    this.client = null;
    this._registeredToolNames = [];
  }

  _setStatus(status, extra = {}) {
    this.status = status;
    const payload = { status, host: this.host, port: this.port, ...extra };
    this.emit('status-changed', payload);
    broadcastStatusToWindows(payload);
  }

  isConnected() {
    return this.status === 'connected';
  }

  getStatus() {
    return {
      status: this.status,
      host: this.host,
      port: this.port,
      toolCount: this._registeredToolNames.length,
      tools: this._registeredToolNames,
    };
  }

  async connectMcp(port, host) {
    if (this.status === 'connected' || this.status === 'connecting') {
      logger.info('[BlenderMcpService] Already connected/connecting, disconnecting first');
      await this.disconnectMcp();
    }

    this.host = host || DEFAULT_HOST;
    const parsedPort = Number(port);
    if (!parsedPort || parsedPort < 1 || parsedPort > 65535 || !Number.isInteger(parsedPort)) {
      logger.warn(`[BlenderMcpService] Invalid port ${port}, falling back to default ${DEFAULT_PORT}`);
      this.port = DEFAULT_PORT;
    } else {
      this.port = parsedPort;
    }
    this._setStatus('connecting');
    logger.info(`[BlenderMcpService] Connecting to Blender at ${this.host}:${this.port} via TCP (official addon protocol)`);

    try {
      this.client = new BlenderTcpClient(this.host, this.port);
      const ping = await this.client.ping();
      if (!ping.ok) {
        throw new Error(`无法连接Blender（${this.host}:${this.port}）: ${ping.error}。请确认：\n1. Blender 5.1+已启动\n2. Edit > Preferences > Add-ons中"MCP"插件已启用\n3. 插件端口设置为${this.port}（当前客户端配置端口）`);
      }

      this._registerTools();

      this._setStatus('connected', { tools: this._registeredToolNames, toolCount: this._registeredToolNames.length });
      logger.info(`[BlenderMcpService] Connected to Blender at ${this.host}:${this.port} successfully, ${this._registeredToolNames.length} tools registered`);

      return {
        ok: true,
        connected: true,
        host: this.host,
        port: this.port,
        toolCount: this._registeredToolNames.length,
        tools: this._registeredToolNames,
      };
    } catch (err) {
      this._setStatus('error', { error: err.message });
      logger.error(`[BlenderMcpService] Connection failed to ${this.host}:${this.port}: ${err.message}`);
      this.client = null;
      this._unregisterTools();
      throw err;
    }
  }

  _registerTools() {
    const executor = getToolExecutor();
    this._unregisterTools();

    const tools = [
      {
        name: 'execute_blender_code',
        description: '在Blender中执行任意Python(bpy)代码。代码执行后必须将结果赋值给名为result的字典变量。这是核心工具，所有场景操作都通过它完成。',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '要执行的Python(bpy)代码。执行后必须设置result = {...}字典返回结果。' },
          },
          required: ['code'],
        },
        handler: async (args) => await this._executeAndFormat(args.code),
      },
      {
        name: 'get_objects_summary',
        description: '获取场景的集合层级结构和所有对象列表（名称、类型、位置、可见性、选中状态），以及材质/相机/灯光名称列表。',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => await this._executeAndFormat(buildGetObjectsSummary()),
      },
      {
        name: 'get_object_detail_summary',
        description: '获取指定对象的结构化详细信息，包括变换、尺寸、父子关系、修改器、约束、材质、可见性、所属集合等。',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: '对象名称' } },
          required: ['name'],
        },
        handler: async (args) => await this._executeAndFormat(buildGetObjectDetailSummary(args.name)),
      },
      {
        name: 'get_blendfile_summary_datablocks',
        description: '返回blend文件的数据块统计（各类datablock数量）、当前工作区、渲染引擎和Blender版本。',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryDatablocks()),
      },
      {
        name: 'get_blendfile_summary_missing_files',
        description: '报告磁盘上缺失的外部文件引用（图片、链接库、字体、声音、视频、缓存、序列等）。',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryMissingFiles()),
      },
      {
        name: 'get_blendfile_summary_of_linked_libraries',
        description: '返回直接和间接链接的库文件树，以及每个库链接的数据块数量。',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryLinkedLibraries()),
      },
      {
        name: 'get_blendfile_summary_path_info',
        description: '获取blend文件的路径、保存状态、是否修改未保存、文件存在时长、大小和备份文件列表。',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryPathInfo()),
      },
      {
        name: 'get_blendfile_summary_usage_guess',
        description: '猜测当前blend文件的主要用途（建模/渲染/动画/合成/几何节点/视频编辑/脚本/油脂笔/UV展开/运动跟踪/音频等），每项给出0-100分和置信度。',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => await this._executeAndFormat(buildGetBlendfileSummaryUsageGuess()),
      },
      {
        name: 'get_screenshot_of_area_as_image',
        description: '截取Blender中指定类型区域的截图并返回PNG图片（base64编码）。默认截取VIEW_3D区域，自动缩放到1MB以内。',
        inputSchema: {
          type: 'object',
          properties: {
            area_type: { type: 'string', description: '区域类型，如VIEW_3D、NODE_EDITOR、IMAGE_EDITOR、UV、GRAPH_EDITOR、DOPESHEET_EDITOR、OUTLINER、PROPERTIES等，默认VIEW_3D', default: 'VIEW_3D' },
            size_limit_in_bytes: { type: 'number', description: '图片大小限制（字节），默认786432(768KB以适应base64后1MB MCP限制)', default: 786432 },
          },
        },
        handler: async (args) => {
          const code = buildGetScreenshotOfAreaAsImage(args.area_type || 'VIEW_3D', args.size_limit_in_bytes);
          return await this._executeScreenshotCode(code);
        },
      },
      {
        name: 'get_screenshot_of_window_as_image',
        description: '截取整个Blender窗口的截图并返回PNG图片（base64编码），自动缩放到1MB以内。',
        inputSchema: {
          type: 'object',
          properties: {
            size_limit_in_bytes: { type: 'number', description: '图片大小限制（字节）', default: 786432 },
          },
        },
        handler: async (args) => {
          const code = buildGetScreenshotOfWindowAsImage(args.size_limit_in_bytes);
          return await this._executeScreenshotCode(code);
        },
      },
      {
        name: 'get_screenshot_of_window_as_json',
        description: '返回Blender窗口布局的JSON描述，包括窗口尺寸、工作区、场景、所有区域类型/位置/大小、活动空间类型、活动对象和选中对象列表。',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => await this._executeAndFormat(buildGetScreenshotOfWindowAsJson()),
      },
      {
        name: 'jump_to_tab_by_name',
        description: '按名称切换到指定工作区（标签页），如"Modeling"、"Rendering"、"Animation"、"UV Editing"、"Scripting"、"Compositing"等。',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: '工作区名称' } },
          required: ['name'],
        },
        handler: async (args) => await this._executeAndFormat(buildJumpToTabByName(args.name)),
      },
      {
        name: 'jump_to_tab_by_space_type',
        description: '切换到主区域为指定空间类型的工作区。可选择是否在不存在时自动创建新工作区。',
        inputSchema: {
          type: 'object',
          properties: {
            space_type: { type: 'string', description: '空间类型，如VIEW_3D、NODE_EDITOR、IMAGE_EDITOR、UV、GRAPH_EDITOR、DOPESHEET_EDITOR、TEXT_EDITOR、PROPERTIES、OUTLINER等' },
            allow_edits: { type: 'boolean', description: '是否允许在找不到时自动创建新工作区', default: false },
          },
          required: ['space_type'],
        },
        handler: async (args) => await this._executeAndFormat(buildJumpToTabBySpaceType(args.space_type, args.allow_edits)),
      },
      {
        name: 'jump_to_view3d_object_by_name',
        description: '在3D视口中选中并聚焦到指定对象。可选择是否自动显示隐藏对象和启用集合。会退出相机视角并框选对象。',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '对象名称' },
            allow_edits: { type: 'boolean', description: '是否允许自动显示隐藏对象和启用集合', default: true },
          },
          required: ['name'],
        },
        handler: async (args) => await this._executeAndFormat(buildJumpToView3dObjectByName(args.name, args.allow_edits !== false)),
      },
      {
        name: 'jump_to_view3d_object_data_by_name',
        description: '在3D视口中选中并聚焦到数据块名称匹配的对象（如按Mesh名称查找）。',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '数据块名称（如Mesh名称）' },
            allow_edits: { type: 'boolean', description: '是否允许自动显示隐藏对象', default: true },
          },
          required: ['name'],
        },
        handler: async (args) => await this._executeAndFormat(buildJumpToView3dObjectDataByName(args.name, args.allow_edits !== false)),
      },
      {
        name: 'import_model',
        description: '导入3D模型文件到Blender当前场景。支持.glb/.gltf/.fbx/.obj/.stl格式。',
        inputSchema: {
          type: 'object',
          properties: { file_path: { type: 'string', description: '模型文件的绝对路径' } },
          required: ['file_path'],
        },
        handler: async (args) => await this._executeAndFormat(buildImportModelCode(args.file_path)),
      },
    ];

    for (const tool of tools) {
      const proxyName = `${BLENDER_TOOL_PREFIX}${tool.name}`;
      executor.registerTool(
        proxyName,
        tool.description,
        tool.inputSchema,
        tool.handler
      );
      this._registeredToolNames.push(proxyName);
    }

    logger.info(`[BlenderMcpService] Registered ${this._registeredToolNames.length} tools: ${this._registeredToolNames.join(', ')}`);
  }

  _unregisterTools() {
    if (this._registeredToolNames.length === 0) return;
    const executor = getToolExecutor();
    for (const name of this._registeredToolNames) {
      try { executor.tools.delete(name); } catch {}
    }
    this._registeredToolNames = [];
  }

  async _executeRaw(code) {
    if (!this.client) {
      throw new Error('Blender MCP未连接，请先连接Blender');
    }
    return await this.client.executeCode(code);
  }

  async _executeAndFormat(code) {
    const response = await this._executeRaw(code);
    if (response.status === 'error') {
      let errMsg = response.message || 'Blender代码执行错误';
      if (response.stderr) {
        errMsg += `\n[stderr]\n${response.stderr}`;
      }
      throw new Error(errMsg);
    }
    const result = response.result;
    if (result && result.status === 'error') {
      let errMsg = result.message || '工具执行错误';
      if (result.available_objects) errMsg += `\n可用对象: ${result.available_objects.join(', ')}`;
      if (result.available_workspaces) errMsg += `\n可用工作区: ${result.available_workspaces.join(', ')}`;
      if (result.available_space_types) errMsg += `\n可用空间类型: ${result.available_space_types.join(', ')}`;
      if (response.stderr) errMsg += `\n[stderr]\n${response.stderr}`;
      throw new Error(errMsg);
    }

    let text = '';
    if (response.stdout) {
      text += response.stdout;
    }
    if (response.stderr) {
      text += text ? '\n' : '';
      text += `[stderr]\n${response.stderr}`;
    }
    if (result !== undefined) {
      const display = { ...result };
      if (display.image_base64) {
        display.image_base64 = `[base64 PNG, ${display.image_base64.length} chars]`;
      }
      const resultStr = typeof display === 'string' ? display : JSON.stringify(display, null, 2);
      text = text ? `${text}\n${resultStr}` : resultStr;
    }
    return text || '代码执行完成（无输出）';
  }

  async _executeScreenshotCode(code) {
    const response = await this._executeRaw(code);
    if (response.status === 'error') {
      throw new Error(response.message || '截图失败');
    }
    const result = response.result;
    if (result && result.status === 'error') {
      throw new Error(result.message || '截图失败');
    }
    if (result && result.image_base64) {
      const areaType = result.area_type || 'window';
      const sizeKB = Math.round(result.image_base64.length * 3 / 4 / 1024);
      return {
        content: [
          { type: 'text', text: `${areaType}截图已生成 (~${sizeKB}KB)` },
          { type: 'image', data: result.image_base64, mimeType: 'image/png' },
        ],
        text: `${areaType}截图已生成 (~${sizeKB}KB)`,
      };
    }
    let text = '';
    if (response.stdout) text += response.stdout;
    if (response.stderr) text += `\n[stderr]\n${response.stderr}`;
    if (result) {
      if (result.message) throw new Error(result.message);
      text += (text ? '\n' : '') + JSON.stringify(result, null, 2);
    }
    return text || '截图失败';
  }

  async disconnectMcp() {
    this._setStatus('disconnecting');
    logger.info('[BlenderMcpService] Disconnecting...');
    this._unregisterTools();
    this.client = null;
    this._setStatus('disconnected');
    return { disconnected: true };
  }

  getBlenderSystemPrompt() {
    let prompt = `你是一个Blender 3D控制助手，通过官方Blender MCP协议连接到正在运行的Blender实例。你可以调用多种专用工具来查看和修改3D场景。

## 核心工具
- **blender_execute_blender_code**: 执行任意bpy Python代码。当其他专用工具无法满足需求时使用此工具。代码执行后必须设置result字典。

## 场景信息工具
- **blender_get_objects_summary**: 获取集合层级树和所有对象列表、材质/相机/灯光名称。开始操作前优先调用。
- **blender_get_object_detail_summary**: 获取指定对象的完整详细信息（变换、修改器、约束、材质、可见性、集合等）。
- **blender_get_screenshot_of_window_as_json**: 获取窗口布局、区域分布、活动对象、选中对象的JSON描述。
- **blender_get_blendfile_summary_datablocks**: 获取数据块统计、渲染引擎、工作区信息。
- **blender_get_blendfile_summary_path_info**: 获取文件路径、保存状态、备份信息。
- **blender_get_blendfile_summary_missing_files**: 检查缺失的外部文件引用。
- **blender_get_blendfile_summary_of_linked_libraries**: 查看链接库依赖。
- **blender_get_blendfile_summary_usage_guess**: 猜测文件用途（建模/渲染/动画等评分）。

## 截图工具
- **blender_get_screenshot_of_area_as_image**: 截取指定区域截图（默认VIEW_3D），返回base64 PNG。每次修改后调用验证。
- **blender_get_screenshot_of_window_as_image**: 截取整个Blender窗口截图。

## 导航工具
- **blender_jump_to_tab_by_name**: 按名称切换工作区标签（Modeling/Rendering/Animation等）。
- **blender_jump_to_tab_by_space_type**: 按空间类型切换工作区。
- **blender_jump_to_view3d_object_by_name**: 在3D视口中选中并框选聚焦到指定对象。
- **blender_jump_to_view3d_object_data_by_name**: 按数据块名称聚焦对象。

## 其他
- **blender_import_model**: 导入3D模型文件（.glb/.gltf/.fbx/.obj/.stl）。

## 使用规则
1. **操作前先调用 blender_get_objects_summary 了解场景**
2. **不要猜测对象名称**，先用工具获取真实名称
3. **复杂操作拆分步骤**，每次少量代码，验证后继续
4. **修改场景后调用截图工具验证结果**
5. 代码执行后必须设置result = {...}字典
6. 回复用户使用中文`;
    if (this._registeredToolNames.length > 0) {
      prompt += '\n\n## 当前已注册工具\n';
      prompt += this._registeredToolNames.map(t => `- ${t}`).join('\n');
    }
    return prompt;
  }

  getBlenderToolNames() {
    return [...this._registeredToolNames];
  }

  async checkStatus(_ctx, payload) {
    const probeHost = payload?.host ?? payload?.mcpHost;
    const probePortRaw = payload?.port ?? payload?.mcpPort;

    if (probeHost || probePortRaw) {
      const probePort = Number(probePortRaw);
      const targetHost = probeHost || this.host || DEFAULT_HOST;
      const targetPort = (!Number.isNaN(probePort) && probePort > 0 && probePort <= 65535)
        ? probePort
        : (this.port || DEFAULT_PORT);

      if (this.isConnected() && targetHost === this.host && targetPort === this.port) {
        return this.getMcpStatus();
      }

      try {
        const probeClient = new BlenderTcpClient(targetHost, targetPort);
        const ping = await probeClient.ping();
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
          };
        }
        return {
          ok: false,
          status: 'addon-not-started',
          host: targetHost,
          port: targetPort,
          addonListening: false,
          error: ping.error || 'MCP插件未在该端口响应'
        };
      } catch (err) {
        let status = 'addon-not-started';
        let msg = err.message;
        if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('连接被拒绝'))) {
          status = 'addon-not-started';
        }
        return {
          ok: false,
          status,
          host: targetHost,
          port: targetPort,
          addonListening: false,
          error: msg
        };
      }
    }

    return this.getMcpStatus();
  }

  async getMcpStatus() {
    return {
      ok: this.status === 'connected',
      status: this.status,
      host: this.host, port: this.port,
      tools: this._registeredToolNames,
      toolCount: this._registeredToolNames.length,
    };
  }

  async callTool(_ctx, payload) {
    const { tool, args, toolName } = payload || {};
    const name = tool || toolName;
    if (!name) throw new Error('Tool name is required');
    const prefixedName = name.startsWith(BLENDER_TOOL_PREFIX) ? name : `${BLENDER_TOOL_PREFIX}${name}`;
    return await getToolExecutor().callTool(prefixedName, args || {}, { skipFrontend: true });
  }

  async importModel(_ctx, payload) {
    const { filePath, file_path } = payload || {};
    const fp = filePath || file_path;
    if (!fp) {
      throw new Error('filePath is required for importModel');
    }
    if (!this.isConnected()) {
      throw new Error('Blender MCP未连接，请先连接Blender');
    }
    const code = buildImportModelCode(fp);
    return await this._executeAndFormat(code);
  }
}

const blenderMcpService = new BlenderMcpService();
export default blenderMcpService;

export function connectBlenderMcp(port, host) { return blenderMcpService.connectMcp(port, host); }
export function disconnectBlenderMcp() { return blenderMcpService.disconnectMcp(); }
export function getBlenderMcpStatus() { return blenderMcpService.getStatus(); }
export function isBlenderMcpConnected() { return blenderMcpService.isConnected(); }
export function getBlenderSystemPrompt() { return blenderMcpService.getBlenderSystemPrompt(); }
export function getBlenderToolNames() { return blenderMcpService.getBlenderToolNames(); }
export function onBlenderMcpStatusChanged(listener) {
  blenderMcpService.on('status-changed', listener);
  return () => blenderMcpService.removeListener('status-changed', listener);
}
