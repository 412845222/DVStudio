from __future__ import annotations

from django.urls import path

from . import api

urlpatterns = [
    path("ping", api.ping, name="comfyui-ping"),
	path("blueprint/chat", api.blueprint_chat, name="comfyui-blueprint-chat"),
	path("blueprint/chat:stream", api.blueprint_chat_stream, name="comfyui-blueprint-chat-stream"),
    path("nanobanana/ref-cache", api.nanobanana_ref_cache, name="comfyui-nanobanana-ref-cache"),
	path("nanobanana/generate", api.nanobanana_generate, name="comfyui-nanobanana-generate"),
    path("nanobanana/generate:stream", api.nanobanana_generate_stream, name="comfyui-nanobanana-generate-stream"),
    path("seedance/generate:stream", api.seedance_generate_stream, name="comfyui-seedance-generate-stream"),
    path("prompt", api.prompt, name="comfyui-prompt"),
    path("history/<str:prompt_id>", api.history, name="comfyui-history"),
    path("view", api.view, name="comfyui-view"),
    path("workflows/list", api.list_workflows, name="comfyui-workflows-list"),
    path("workflows/get", api.get_workflow, name="comfyui-workflow-get"),
	path("run", api.run, name="comfyui-run"),
	path("cancel", api.cancel, name="comfyui-cancel"),
	path("job", api.job, name="comfyui-job"),
    path("outputs", api.outputs, name="comfyui-outputs"),
    path("projects/list", api.list_projects, name="comfyui-projects-list"),
    path("projects/save", api.save_project, name="comfyui-projects-save"),
    path("projects/load", api.load_project, name="comfyui-projects-load"),
    path("projects/delete", api.delete_project, name="comfyui-projects-delete"),
    path("projects/assets/upload", api.upload_project_asset, name="comfyui-projects-assets-upload"),
    path("projects/assets/import", api.import_project_asset, name="comfyui-projects-assets-import"),
    path("projects/assets/delete", api.delete_project_asset, name="comfyui-projects-assets-delete"),
    path("projects/assets/local", api.get_local_project_asset, name="comfyui-projects-assets-local"),
]
