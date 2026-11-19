#!/usr/bin/env python3
"""Build web-sized copies of the Hex Legacy assets.

Reads the originals in the project folder (never changes them) and writes
small WebP / OGG / MP4 versions to <project>/web_assets/, mirroring the
folder structure. Runs incrementally: files whose output is newer than the
source are skipped.

Usage:
  python3 tools/build_web_assets.py [--only REGEX] [--jobs N] [--force] [--list]

  --only REGEX   only process source paths (relative, with /) matching REGEX
  --list         show what would be done, change nothing
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web_assets"

# Paths matching this are never exported
EXCLUDE = re.compile(
    r"(^|/)(_src|_old|variants|_freebeat_work|heroes_1024|_style|tools|web_assets|_to_delete)(/|$)"
    r"|_raw_bg\.|_backup|_source\.mp4$"
    r"|anim_[^/]+/[^/]+\.png$"    # single animation frames (the sheet is used instead)
    r"|\.(md|txt|py|sh|bat|ps1|wav|mp3)$"
)

# (regex on relative path, kind, max long side or None, quality)
# First match wins.
RULES = [
    (r"_loop\.mp4$",                                        "video", 1280, 28),
    (r"^audio/(music|sfx|ambient|voice)/[^/]+\.ogg$",       "copy", None, None),
    (r"\.json$",                                            "copy", None, None),
    (r"_sheet_\d+x\d+\.png$",                               "img", 4096, 85),
    (r"^ui/screens/",                                       "img", 1920, 82),
    (r"^(backgrounds|city)/[^/]+\.png$",                    "img", 1920, 82),
    (r"^map/biomes/",                                       "img", 1920, 82),
    (r"^map/[^/]+\.png$",                                   "img", 1920, 82),
    (r"^events/",                                           "img", 1280, 80),
    (r"^logo/",                                             "img", 1024, 90),
    (r"^ui/portraits/heroes/",                              "img", 512, 88),
    (r"^ui/portraits/",                                     "img", 256, 88),
    (r"^ui/hero_screen/ui_(hero_screen_bg|talent_tree_bg)", "img", 1920, 82),
    (r"^ui/",                                               "img", 640, 90),
    (r"^icons/",                                            "img", 128, 90),
    (r"^(units|neutrals|bosses|heroes|heroes_battle)/[^/]+\.png$", "img", 640, 88),
    (r"^map/",                                              "img", 384, 88),
    (r"^vfx/",                                              "img", 512, 88),
    (r"\.png$",                                             "img", 1024, 85),
]
RULES = [(re.compile(p), k, m, q) for p, k, m, q in RULES]


def plan(only):
    only_re = re.compile(only) if only else None
    jobs = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = Path(dirpath).relative_to(ROOT).as_posix()
        if rel_dir != "." and EXCLUDE.search(rel_dir + "/"):
            dirnames[:] = []
            continue
        for fn in filenames:
            rel = fn if rel_dir == "." else f"{rel_dir}/{fn}"
            if "/" not in rel:          # nothing in the project root
                continue
            if EXCLUDE.search(rel):
                continue
            if only_re and not only_re.search(rel):
                continue
            for rx, kind, maxside, q in RULES:
                if rx.search(rel):
                    if kind == "img" and not rel.lower().endswith(".png"):
                        break
                    if kind == "img":
                        dst = OUT / (rel[:-4] + ".webp")
                    else:
                        dst = OUT / rel
                    jobs.append((rel, str(dst), kind, maxside, q))
                    break
    return jobs


def run(job, force=False):
    rel, dst, kind, maxside, q = job
    src = ROOT / rel
    dst = Path(dst)
    if not force and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return rel, "skip", dst.stat().st_size
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.stem + ".tmp" + dst.suffix)
    try:
        if kind == "img":
            im = Image.open(src)
            im.load()
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA")
            if maxside and max(im.size) > maxside:
                s = maxside / max(im.size)
                im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
            im.save(tmp, "WEBP", quality=q, method=4, alpha_quality=90)
        elif kind == "video":
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-an",
                 "-vf", f"scale='min({maxside},iw)':-2", "-c:v", "libx264",
                 "-preset", "veryfast", "-crf", str(q), "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", "-f", "mp4", str(tmp)],
                check=True)
        else:
            shutil.copyfile(src, tmp)
        os.replace(tmp, dst)
        return rel, "done", dst.stat().st_size
    except Exception as e:  # keep going, report at the end
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        return rel, f"ERROR {e}", 0


def write_manifest():
    files = {}
    for p in sorted(OUT.rglob("*")):
        if p.is_file() and p.name != "manifest.json" and ".tmp." not in p.name:
            files[p.relative_to(OUT).as_posix()] = p.stat().st_size
    (OUT / "manifest.json").write_text(json.dumps(files, indent=0), encoding="utf-8")
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    jobs = plan(a.only)
    if a.list:
        for j in jobs:
            print(j[2], j[0])
        print(len(jobs), "files")
        return
    done = skip = err = 0
    with Pool(a.jobs) as pool:
        for rel, status, size in pool.imap_unordered(_runner(a.force), jobs):
            if status == "done":
                done += 1
            elif status == "skip":
                skip += 1
            else:
                err += 1
                print(rel, status, file=sys.stderr)
    files = write_manifest()
    total = sum(files.values())
    print(f"done {done}, skipped {skip}, errors {err}; web_assets: {len(files)} files, {total/1e6:.1f} MB")


class _runner:
    def __init__(self, force):
        self.force = force

    def __call__(self, job):
        return run(job, self.force)


if __name__ == "__main__":
    main()
