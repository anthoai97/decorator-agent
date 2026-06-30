from __future__ import annotations

from sqlalchemy import CheckConstraint, Column, Float, ForeignKey, Index, Integer, MetaData, Table, Text, text

SERVER_METADATA = MetaData()

current_state_table = Table(
    "current_state",
    SERVER_METADATA,
    Column("id", Integer, primary_key=True),
    Column("revision", Integer, nullable=False),
    Column("state_json", Text, nullable=False),
    Column("updated_at", Text, nullable=False, server_default=text("CURRENT_TIMESTAMP")),
    CheckConstraint("id = 1", name="current_state_singleton_id"),
)

commands_table = Table(
    "commands",
    SERVER_METADATA,
    Column("id", Integer, primary_key=True),
    Column("source", Text, nullable=False),
    Column("type", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("command_json", Text, nullable=False),
    Column("error_message", Text),
    Column("created_at", Text, nullable=False, server_default=text("CURRENT_TIMESTAMP")),
)

events_table = Table(
    "events",
    SERVER_METADATA,
    Column("id", Integer, primary_key=True),
    Column("type", Text, nullable=False),
    Column("revision", Integer, nullable=False),
    Column("event_json", Text, nullable=False),
    Column("created_at", Text, nullable=False, server_default=text("CURRENT_TIMESTAMP")),
)

artifacts_table = Table(
    "artifacts",
    SERVER_METADATA,
    Column("id", Text, primary_key=True),
    Column("kind", Text, nullable=False),
    Column("object_type", Text, nullable=False),
    Column("display_name", Text, nullable=False),
    Column("placement", Text, nullable=False),
    Column("content_type", Text, nullable=False),
    Column("storage_key", Text, nullable=False),
    Column("thumbnail_storage_key", Text),
    Column("source", Text, nullable=False),
    Column("width_m", Float),
    Column("height_m", Float),
    Column("depth_m", Float),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Index("artifacts_kind_type_placement_idx", "kind", "object_type", "placement"),
    Index("artifacts_source_idx", "source"),
)

artifact_tags_table = Table(
    "artifact_tags",
    SERVER_METADATA,
    Column("artifact_id", Text, ForeignKey("artifacts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag", Text, primary_key=True),
    Index("artifact_tags_tag_idx", "tag", "artifact_id"),
)
