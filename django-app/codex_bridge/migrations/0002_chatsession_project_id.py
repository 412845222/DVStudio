from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("codex_bridge", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatsession",
            name="project_id",
            field=models.IntegerField(blank=True, db_index=True, null=True),
        ),
    ]
