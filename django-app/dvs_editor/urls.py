from __future__ import annotations

from django.urls import path

from .api import component_library

urlpatterns = [
    path("component-library/components", component_library.components, name="component-library-components"),
    path("component-library/components/<uuid:item_id>", component_library.component_detail, name="component-library-detail"),
    path("component-library/import", component_library.import_components, name="component-library-import"),
]
