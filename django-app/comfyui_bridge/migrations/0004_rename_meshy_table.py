from __future__ import annotations

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("comfyui_bridge", "0003_align_meshytaskmirror_fields"),
    ]

    operations = [
        migrations.AlterModelTable(
            name="meshytaskmirror",
            table="comfyui_meshy_task_mirror",
        ),
    ]