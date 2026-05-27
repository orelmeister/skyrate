"""Standalone scheduler entrypoint for the DigitalOcean worker component.

Runs ``init_scheduler()`` in a dedicated process so the user-facing uvicorn
workers in the ``backend`` service never execute APScheduler jobs.

The backend service sets ``SKYRATE_DISABLE_SCHEDULER=1`` (see _spec.yaml)
to skip its own in-process scheduler. The cross-worker file lock in
``scheduler_service.init_scheduler`` remains as a defensive safety net.

Started 2026-05-27 as Phase 2 of the production perf hot fix.
"""
import logging
import os
import signal
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("scheduler_worker")


def main() -> None:
    # Ensure the scheduler is enabled in THIS process regardless of any
    # env-wide override that may have been inherited by mistake.
    os.environ.pop("SKYRATE_DISABLE_SCHEDULER", None)
    # Use a worker-specific lock path so it never collides with the backend
    # container's /tmp (containers are isolated, but this is belt + braces
    # and helps diagnostics).
    os.environ.setdefault(
        "SKYRATE_SCHEDULER_LOCK", "/tmp/skyrate_scheduler_worker.lock"
    )

    from app.services.scheduler_service import (  # noqa: E402  (env first)
        init_scheduler,
        shutdown_scheduler,
    )

    logger.info("Scheduler worker booting (pid=%s)", os.getpid())
    init_scheduler()
    logger.info("Scheduler worker ready; entering idle loop")

    _stop = {"flag": False}

    def _handle(signum, _frame):
        logger.info("Received signal %s, shutting down scheduler", signum)
        _stop["flag"] = True

    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)

    try:
        while not _stop["flag"]:
            time.sleep(5)
    finally:
        try:
            shutdown_scheduler()
        except Exception as e:  # noqa: BLE001
            logger.warning("shutdown_scheduler raised: %s", e)
        logger.info("Scheduler worker exited cleanly")


if __name__ == "__main__":
    main()
