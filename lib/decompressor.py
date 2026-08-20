"""zstd decompression: source ~/.dsh/sessions -> decoded-sessions.

REQUIREMENTS.md M1. The source tree already uses the encoded workdir
names (e.g. ``--D-dsh-recommend--``), so we mirror the relative layout:

    <source>/<dirEncoded>/<session-id>/session.jsonl.zstd
        -> <dst>/<dirEncoded>/<session-id>/session.json

The decoded file keeps the JSONL format (one JSON object per line).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional, Tuple

# pyzstd is preferred; zstandard is the fallback (both expose streaming reads)
try:  # pragma: no cover
    import pyzstd as _zstd  # type: ignore
    _HAS_PYZSTD = True
except Exception:  # pragma: no cover
    _HAS_PYZSTD = False

try:  # pragma: no cover
    import zstandard as _zs  # type: ignore
    _HAS_ZSTANDARD = True
except Exception:  # pragma: no cover
    _HAS_ZSTANDARD = False

DEFAULT_SOURCE = Path(r"C:\Users\23074\.dsh\sessions")
DEFAULT_DST = Path(__file__).resolve().parent.parent / "decoded-sessions"


def zstd_decompress(data: bytes) -> bytes:
    """Decompress a zstd blob with whichever binding is installed.

    Uses streaming decompression so frames without a declared content
    size (common for DSH's streamed session logs) decode correctly.
    """
    if _HAS_PYZSTD:
        return _zstd.decompress(data)
    if _HAS_ZSTANDARD:
        import io
        dctx = _zs.ZstdDecompressor()
        with dctx.stream_reader(io.BytesIO(data)) as reader:
            return reader.read()
    raise RuntimeError(
        "No zstd binding available: install pyzstd or zstandard "
        "(pip install zstandard)"
    )


def decode_file(src: os.PathLike, dst: os.PathLike) -> Tuple[int, int]:
    """Decode one .jsonl.zstd file into dst.

    Returns (input_bytes, output_bytes). Raises FileNotFoundError /
    RuntimeError when the source is missing or undecodable.
    """
    src = Path(src)
    dst = Path(dst)
    raw = src.read_bytes()
    out = zstd_decompress(raw)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(out)
    return len(raw), len(out)


def _needs_refresh(src: Path, dst: Path) -> bool:
    if not dst.exists():
        return True
    try:
        return dst.stat().st_mtime < src.stat().st_mtime
    except OSError:
        return True


def sync_all(source_root: Optional[os.PathLike] = None,
             dst_root: Optional[os.PathLike] = None,
             force: bool = False) -> List[dict]:
    """Walk source_root for ``session.jsonl.zstd`` files and decode any that
    are missing or older than their decoded counterpart.

    Returns a list of results:
        {dir, session, src, dst, status: decoded|skipped|error, error?}
    """
    source_root = Path(source_root) if source_root else DEFAULT_SOURCE
    dst_root = Path(dst_root) if dst_root else DEFAULT_DST
    results: List[dict] = []

    if not source_root.is_dir():
        return [{"status": "error", "error": f"source missing: {source_root}"}]

    for src in sorted(source_root.rglob("session.jsonl.zstd")):
        rel = src.relative_to(source_root)
        # session.jsonl.zstd -> session.json
        dst = dst_root / rel.parent / "session.json"
        item = {
            "dir": rel.parent.parent.name if rel.parent.parent != rel.parent else rel.parent.name,
            "session": rel.parent.name,
            "src": str(src),
            "dst": str(dst),
            "status": "skipped",
        }
        try:
            if force or _needs_refresh(src, dst):
                item["status"] = "decoded"
                item["inBytes"], item["outBytes"] = decode_file(src, dst)
            else:
                item["status"] = "skipped"
        except Exception as exc:  # pragma: no cover
            item["status"] = "error"
            item["error"] = str(exc)
        results.append(item)
    return results


if __name__ == "__main__":  # pragma: no cover
    import json
    out = sync_all(force="--force" in __import__("sys").argv)
    print(json.dumps(out, ensure_ascii=False, indent=2))
    decoded = [r for r in out if r["status"] == "decoded"]
    print(f"\n{len(decoded)} decoded, "
          f"{sum(1 for r in out if r['status']=='skipped')} skipped, "
          f"{sum(1 for r in out if r['status']=='error')} error")
