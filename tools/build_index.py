#!/usr/bin/env python3
"""掃描 wiki 的 Markdown 檔，產生網站用的 wiki-index.json 與 _sidebar.md。

用法（在 law_wiki 資料夾內）：
    python tools/build_index.py

新增或改名卡片後執行一次；推到 GitHub 時，Actions 也會自動執行。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"raw", "assets", "tools", ".github", ".git", "node_modules"}
SKIP_FILES = {"_sidebar.md", "README.md"}

# 側邊欄分組順序：(資料夾或檔名, 顯示標題)
SECTIONS = [
    ("爭點", "🎯 三個爭點"),
    ("法條", "📜 法條"),
    ("判決", "⚖️ 判決"),
    ("文獻", "📚 學說文獻"),
    ("草稿", "✏️ 草稿"),
    ("模板", "🧩 模板"),
]
TOP_PAGES = [
    ("00_總覽", "🏠 總覽"),
    ("進度", "📅 進度"),
    ("graph", "🕸️ 關係圖"),
    ("卡片總表", "🗂️ 卡片總表"),
    ("名詞小辭典", "📖 名詞小辭典"),
    ("待查清單", "🔍 待查清單"),
    ("AGENTS", "🤖 AI 使用說明"),
]

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)
CODE_RE = re.compile(r"```.*?```|`[^`\n]+`", re.S)
LINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]")


def parse_front_matter(text):
    m = FM_RE.match(text)
    meta = {}
    if not m:
        return meta, text
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            val = [v.strip() for v in val[1:-1].split(",") if v.strip()]
        meta[key.strip()] = val
    return meta, text[m.end():]


def status_of(meta):
    s = str(meta.get("查證", ""))
    for mark in ("✅", "⚠️", "❓"):
        if s.startswith(mark):
            return mark
    return ""


def main():
    pages = []
    for p in sorted(ROOT.rglob("*.md")):
        rel = p.relative_to(ROOT)
        if rel.parts[0] in SKIP_DIRS or rel.name in SKIP_FILES:
            continue
        text = p.read_text(encoding="utf-8")
        meta, body = parse_front_matter(text)
        h1 = re.search(r"^#\s+(.+)$", body, re.M)
        folder = rel.parts[0] if len(rel.parts) > 1 else ""
        pages.append({
            "name": p.stem,
            "path": rel.with_suffix("").as_posix(),
            "title": h1.group(1).strip() if h1 else p.stem,
            "folder": folder,
            "type": meta.get("類型", folder or "頁面"),
            "issues": [str(i) for i in meta.get("爭點", [])] if isinstance(meta.get("爭點"), list) else [],
            "status": "" if folder == "模板" else status_of(meta),
            "links": sorted(set(n.strip() for n in LINK_RE.findall(CODE_RE.sub("", body)))),
        })

    (ROOT / "wiki-index.json").write_text(
        json.dumps({"pages": pages}, ensure_ascii=False, indent=1), encoding="utf-8")

    by_name = {pg["name"]: pg for pg in pages}
    lines = []
    for name, label in TOP_PAGES:
        pg = by_name.get(name)
        if pg:
            lines.append(f"- [{label}](/{pg['path']})")
    for folder, label in SECTIONS:
        items = [pg for pg in pages if pg["folder"] == folder]
        if not items:
            continue
        lines.append(f"- {label}")
        for pg in items:
            badge = f" {pg['status']}" if pg["status"] else ""
            lines.append(f"  - [{pg['name']}{badge}](/{pg['path']})")
    (ROOT / "_sidebar.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"已索引 {len(pages)} 頁 → wiki-index.json、_sidebar.md")


if __name__ == "__main__":
    main()
