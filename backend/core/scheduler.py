from __future__ import annotations

import threading
import time
from datetime import UTC, datetime
from typing import Callable


class TrackerScheduler:
    def __init__(
        self,
        config_provider: Callable[[], dict],
        task_runner: Callable[[str], None],
        meta_provider: Callable[[], dict],
        meta_saver: Callable[[dict], None],
    ) -> None:
        self._config_provider = config_provider
        self._task_runner = task_runner
        self._meta_provider = meta_provider
        self._meta_saver = meta_saver
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def _should_run(self, now: datetime, task_name: str, target_time: str) -> bool:
        hour, minute = (int(part) for part in target_time.split(":"))
        if now.hour != hour or now.minute != minute:
            return False

        meta = self._meta_provider()
        scheduler_meta = meta.setdefault("scheduler", {})
        last_run = scheduler_meta.get(task_name)
        today = now.date().isoformat()
        if last_run == today:
            return False
        scheduler_meta[task_name] = today
        self._meta_saver(meta)
        return True

    def _loop(self) -> None:
        while not self._stop_event.is_set():
            now = datetime.now(UTC).astimezone()
            config = self._config_provider()
            try:
                if config.get("enable_daily_sync") and self._should_run(
                    now, "daily_sync", config.get("daily_sync_time", "09:00")
                ):
                    self._task_runner("daily_sync")
                if (
                    now.weekday() == 4
                    and config.get("enable_weekly_report")
                    and self._should_run(
                        now, "weekly_report", config.get("weekly_report_time", "17:30")
                    )
                ):
                    self._task_runner("weekly_report")
            except Exception as exc:
                print(f"[scheduler] error: {exc}")
            time.sleep(30)
