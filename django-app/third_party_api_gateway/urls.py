from django.urls import path
from . import api

urlpatterns = [
    path("meshy/generate", api.meshy_generate, name="meshy-generate"),
    path("meshy/task", api.meshy_task, name="meshy-task"),
    path("meshy/stop", api.meshy_stop, name="meshy-stop"),
    path("meshy/delete", api.meshy_delete, name="meshy-delete"),
    path("meshy/tasks", api.meshy_tasks_list, name="meshy-tasks-list"),
    path("meshy/task/detail", api.meshy_task_detail, name="meshy-task-detail"),
    path("meshy/balance", api.meshy_balance, name="meshy-balance"),
    path("nanobanana/ref-cache", api.nanobanana_ref_cache, name="nanobanana-ref-cache"),
    path("seedream/ref-cache", api.seedream_ref_cache, name="seedream-ref-cache"),
    path("nanobanana/generate", api.nanobanana_generate, name="nanobanana-generate"),
    path("nanobanana/generate:stream", api.nanobanana_generate_stream, name="nanobanana-generate-stream"),
    path("seedream/generate:stream", api.seedream_generate_stream, name="seedream-generate-stream"),
    path("seedance/generate:stream", api.seedance_generate_stream, name="seedance-generate-stream"),
    path("seedance/tasks", api.seedance_tasks_list, name="seedance-tasks-list"),
    path("seedance/task/detail", api.seedance_task_detail, name="seedance-task-detail"),
    path("seedance/sync-tasks", api.seedance_sync_tasks, name="seedance-sync-tasks"),
    path("jimeng/image/generate:stream", api.jimeng_image_generate_stream, name="jimeng-image-generate-stream"),
    path("jimeng/video/generate:stream", api.jimeng_video_generate_stream, name="jimeng-video-generate-stream"),
    path("blueprint/chat:stream", api.blueprint_chat_stream, name="blueprint-chat-stream"),
]