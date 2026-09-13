#!/usr/bin/env python3
"""Render catalog cover PNGs inside Blender, one asset at a time.

This script is launched by Blender MCP.  Each model starts from a clean scene;
progress and failures are appended to JSONL so a stopped batch can resume
without re-rendering completed covers.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
import traceback
from pathlib import Path


def _load_renderer(path: Path):
    spec = importlib.util.spec_from_file_location("commercial_cover_renderer", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load renderer: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _catalog_models(manifest: Path) -> list[tuple[str, Path]]:
    data = json.loads(manifest.read_text(encoding="utf-8"))
    models: dict[str, Path] = {}
    for asset in data.get("assets", []):
        if asset.get("field") != "file_url":
            continue
        slug = asset.get("slug")
        source = asset.get("source")
        if slug and source:
            models[str(slug)] = Path(str(source)).resolve()
    return sorted(models.items())


def _append_jsonl(path: Path, record: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        handle.flush()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--standard", required=True, type=Path)
    parser.add_argument("--renderer", required=True, type=Path)
    parser.add_argument("--skip-slug", action="append", default=[])
    parser.add_argument("--slug", action="append", default=[])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None)

    renderer = _load_renderer(args.renderer.resolve())
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    log = output_dir.parent / "render-progress.jsonl"
    models = _catalog_models(args.manifest.resolve())
    selected = set(args.slug)
    if selected:
        models = [(slug, source) for slug, source in models if slug in selected]
    skipped = set(args.skip_slug)
    _append_jsonl(log, {"event": "batch-start", "models": len(models), "time": time.time()})

    completed = failed = 0
    for index, (slug, source) in enumerate(models, 1):
        output = output_dir / f"{slug}.png"
        if slug in skipped or (output.is_file() and not args.force):
            _append_jsonl(log, {"event": "skip", "index": index, "slug": slug})
            continue
        started = time.monotonic()
        try:
            rendered = renderer.render_cover(source, output, args.standard.resolve())
            completed += 1
            _append_jsonl(
                log,
                {
                    "event": "rendered",
                    "index": index,
                    "slug": slug,
                    "seconds": round(time.monotonic() - started, 3),
                    "result": rendered,
                },
            )
        except Exception as exc:
            failed += 1
            _append_jsonl(
                log,
                {
                    "event": "failed",
                    "index": index,
                    "slug": slug,
                    "seconds": round(time.monotonic() - started, 3),
                    "error": repr(exc),
                    "traceback": traceback.format_exc(),
                },
            )
    _append_jsonl(
        log,
        {"event": "batch-finish", "completed": completed, "failed": failed, "time": time.time()},
    )


if __name__ == "__main__":
    main()
