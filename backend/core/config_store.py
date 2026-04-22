from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .utils import read_json, write_json

DEFAULT_CONFIG: dict[str, Any] = {
    'gitlab_url': '',
    'token': '',
    'project_ref': '',
    'project_ref_history': [],
    'import_file': '',
    'gemini_api_key': '',
    'enable_daily_sync': True,
    'daily_sync_time': '09:00',
    'enable_weekly_report': True,
    'weekly_report_time': '17:30',
}

MAX_PROJECT_REF_HISTORY = 10


def data_dir() -> Path:
    root = os.environ.get('GITLAB_TRACKER_DATA_DIR')
    base = Path(root) if root else Path(__file__).resolve().parents[1] / 'data'
    base.mkdir(parents=True, exist_ok=True)
    return base


CONFIG_PATH = data_dir() / 'config.json'
CACHE_PATH = data_dir() / 'issues_cache.json'
META_PATH = data_dir() / 'meta.json'
REPORT_DIR = data_dir() / 'reports'


def normalize_project_ref_history(current_value: Any, history: Any, limit: int = MAX_PROJECT_REF_HISTORY) -> list[str]:
    items: list[str] = []

    def push(value: Any) -> None:
        text = str(value).strip() if value is not None else ''
        if text and text not in items:
            items.append(text)

    push(current_value)
    if isinstance(history, list):
        for entry in history:
            push(entry)

    return items[:limit]


def load_config() -> dict[str, Any]:
    payload = DEFAULT_CONFIG.copy()
    payload.update(read_json(CONFIG_PATH, {}))
    payload['project_ref_history'] = normalize_project_ref_history(
        payload.get('project_ref', ''),
        payload.get('project_ref_history', []),
    )
    return payload


def save_config(payload: dict[str, Any]) -> dict[str, Any]:
    merged = DEFAULT_CONFIG.copy()
    merged.update(payload)
    merged['project_ref_history'] = normalize_project_ref_history(
        merged.get('project_ref', ''),
        merged.get('project_ref_history', []),
    )
    write_json(CONFIG_PATH, merged)
    return merged


def load_meta() -> dict[str, Any]:
    return read_json(META_PATH, {'last_sync': None, 'last_report': None, 'latest_report_path': None, 'scheduler': {}})


def save_meta(payload: dict[str, Any]) -> dict[str, Any]:
    write_json(META_PATH, payload)
    return payload
