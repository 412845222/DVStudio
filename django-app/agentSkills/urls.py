from django.urls import path

from .views import scene_layout_run, scene_lighting_models, scene_lighting_run, scene_lighting_run_stream, scene_understand_models, scene_understand_run, scene_understand_run_stream, unreal_export_create_job, unreal_export_job_detail, unreal_export_next_job, unreal_export_register, unreal_export_session_detail, unreal_export_session_heartbeat, unreal_export_sessions, unreal_export_update_job


urlpatterns = [
    path('scene-understand/models', scene_understand_models),
    path('scene-understand/run', scene_understand_run),
    path('scene-understand/run:stream', scene_understand_run_stream),
    path('scene-lighting/models', scene_lighting_models),
    path('scene-lighting/run', scene_lighting_run),
    path('scene-lighting/run:stream', scene_lighting_run_stream),
    path('scene-layout/run', scene_layout_run),
    path('unreal-export/sessions', unreal_export_sessions),
    path('unreal-export/sessions/register', unreal_export_register),
    path('unreal-export/sessions/<str:session_id>', unreal_export_session_detail),
    path('unreal-export/sessions/<str:session_id>/heartbeat', unreal_export_session_heartbeat),
    path('unreal-export/sessions/<str:session_id>/jobs/next', unreal_export_next_job),
    path('unreal-export/jobs/create', unreal_export_create_job),
    path('unreal-export/jobs/<str:job_id>', unreal_export_job_detail),
    path('unreal-export/jobs/<str:job_id>/status', unreal_export_update_job),
]