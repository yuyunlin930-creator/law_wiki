#!/usr/bin/env python3
"""把要上傳 GitHub 的檔案複製到 tools/待上傳/<日期時間>/，保留資料夾結構。
打開那個資料夾，全選（Ctrl+A）拖進 GitHub 網頁的 Upload files，一次就能上傳。

用法（在 law_wiki 資料夾內）：
    python tools/make_upload_batch.py               # 和上次打包比較，只收有改過的檔案
    python tools/make_upload_batch.py 檔案1 檔案2   # 指定要打包的檔案（路徑相對於 law_wiki）

注意：「上次打包清單」假設你上次打包的檔案都有上傳成功。
"""
import datetime
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "待上傳"
MANIFEST = OUT / "上次打包清單.json"
SKIP_TOP = {".git", "node_modules"}


def all_files():
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT)
        if rel.parts[0] in SKIP_TOP or rel.parts[:2] == ("tools", "待上傳"):
            continue
        yield rel.as_posix(), p


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    current = {rel: sha(p) for rel, p in all_files()}
    if len(sys.argv) > 1:
        picked = [a.replace("\\", "/").lstrip("./") for a in sys.argv[1:]]
        missing = [f for f in picked if f not in current]
        if missing:
            sys.exit("找不到這些檔案：" + "、".join(missing))
    else:
        if not MANIFEST.exists():
            sys.exit("還沒有上次打包清單：第一次請指定檔案，例如 python tools/make_upload_batch.py 進度.md")
        old = json.loads(MANIFEST.read_text(encoding="utf-8"))
        picked = [f for f, h in current.items() if old.get(f) != h]
    if not picked:
        print("沒有需要上傳的檔案。")
        return

    taipei = datetime.timezone(datetime.timedelta(hours=8))
    stamp = datetime.datetime.now(taipei).strftime("%Y-%m-%d_%H%M")
    dest = OUT / stamp
    for f in picked:
        target = dest / f
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / f, target)

    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(current, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"已打包 {len(picked)} 個檔案 → tools/待上傳/{stamp}/")
    for f in picked:
        print("  -", f)
    print("上傳方式：打開這個資料夾 → Ctrl+A 全選 → 拖進 GitHub repo 根目錄的 Add file → Upload files → Commit changes")


if __name__ == "__main__":
    main()
