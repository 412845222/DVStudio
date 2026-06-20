from __future__ import annotations

from django.urls import path

from .assets import api as assets_api
from .projects import api

urlpatterns = [
    path("list", api.list_projects, name="aiworkflow-projects-list"),
    path("folder/open", api.open_project_folder, name="aiworkflow-projects-folder-open"),
    path("save", api.save_project, name="aiworkflow-projects-save"),
    path("load", api.load_project, name="aiworkflow-projects-load"),
    path("delete", api.delete_project, name="aiworkflow-projects-delete"),
    path("assets/health", assets_api.project_asset_route_health, name="aiworkflow-projects-assets-health"),
    path("assets/upload", assets_api.upload_project_asset, name="aiworkflow-projects-assets-upload"),
    path("assets/import", assets_api.import_project_asset, name="aiworkflow-projects-assets-import"),
    path("assets/delete", assets_api.delete_project_asset, name="aiworkflow-projects-assets-delete"),
    path("assets/resolve", assets_api.resolve_project_asset, name="aiworkflow-projects-assets-resolve"),
    path("assets/repair", assets_api.repair_project_asset, name="aiworkflow-projects-assets-repair"),
]
