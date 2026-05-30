#!/usr/bin/env python3
"""
Black Flag PDF Extractor v4 — Fixed splitting, individual item extraction.
"""

import argparse, json, os, re, subprocess, sys, time, concurrent.futures
from pathlib import Path

HOME = "/home/jon"
CLAUDE_TIMEOUT = 120
MAX_WORKERS = 3


def pdftotext(path: str) -> str:
    r = subprocess.run(["pdftotext", path, "-"],
                       capture_output=True, text=True, timeout=30)
    if r.returncode != 0 or not r.stdout.strip():
        raise RuntimeError(f"pdftotext failed: {r.stderr}")
    return r.stdout.strip()


def split_items(text: str) -> dict:
    """Split text into individual lineage, heritage, and background blocks."""
    items = {"lineages": [], "heritages": [], "backgrounds": []}

    # Find all "LINEAGE TRAITS" headers with their lineage names
    lineage_headers = list(re.finditer(
        r'\n([A-Z][A-Z\s]{2,30})\s+LINEAGE\s+TRAITS?\s*\n', text
    ))

    # Find "Heritages" and "Background" boundaries
    heritage_header = re.search(r'\nHeritages?\n', text)
    bg_header = re.search(r'\nBackground\n', text)

    lineage_section_end = heritage_header.start() if heritage_header else len(text)
    heritage_section_start = heritage_header.end() if heritage_header else 0
    heritage_section_end = bg_header.start() if bg_header else len(text)
    bg_section_start = bg_header.end() if bg_header else 0

    # Process lineages
    for i, match in enumerate(lineage_headers):
        name = match.group(1).strip()
        trait_start = match.end()
        trait_end = lineage_headers[i+1].start() if i+1 < len(lineage_headers) else lineage_section_end

        # Find flavor text before traits — name may be preceded by \n or \x0c (page break)
        # Try multiple patterns for the name header
        flavor_start = -1
        for prefix in ["\n", "\x0c"]:
            name_header = f"{prefix}{name}\n"
            pos = text.rfind(name_header, 0, match.start())
            if pos >= 0:
                flavor_start = pos
                break
        if flavor_start == -1:
            flavor_start = max(0, match.start() - 3000)

        block = text[flavor_start:trait_end].strip()
        items["lineages"].append({"name": name, "text": block})

    # Process heritages
    if heritage_section_start > 0:
        htext = text[heritage_section_start:heritage_section_end]

        # Find heritage name headers — may be preceded by \n or \x0c
        name_matches = []
        for prefix in ["\n", "\x0c"]:
            pattern = f"{prefix}([A-Z][A-Z\\s]{{3,30}})\n"
            for m in re.finditer(pattern, htext):
                name_matches.append((m, m.group(1).strip()))
        skip = {"HERITAGES", "WASTELANDER MUTATIONS", "ADVENTURING MOTIVATION",
                "BACKGROUND", "LINEAGE", "TALENT", "COMING SOON",
                "LINEAGES AND HERITAGES", "COMMON HERITAGES BY LINEAGE"}

        heritage_names = []
        for m, name in name_matches:
            if name not in skip:
                heritage_names.append((name, m.start()))

        for i, (name, pos) in enumerate(heritage_names):
            start = pos + len(f"\n{name}\n")
            end = heritage_names[i+1][1] if i+1 < len(heritage_names) else len(htext)
            block = htext[max(0, pos-50):end].strip()
            items["heritages"].append({"name": name, "text": block})

    # Process backgrounds
    if bg_section_start > 0:
        bgtext = text[bg_section_start:]
        # Find the first background name
        bg_match = re.search(r'\n([A-Z][A-Z\s]{3,30})\n', bgtext)
        if bg_match:
            name = bg_match.group(1).strip()
            end = len(bgtext)
            # Check if next section exists
            next_match = re.search(r'\n([A-Z][A-Z\s]{3,30})\n', bgtext[bg_match.end():])
            if next_match:
                end = bg_match.end() + next_match.start()
            block = bgtext[bg_match.start():end].strip()
            items["backgrounds"].append({"name": name, "text": block})

    return items


LINEAGE_PROMPT = """Extract this Black Flag lineage into JSON. Output ONLY valid JSON — no markdown.

{
  "name": "LINEAGE NAME",
  "identifier": "lowercase-hyphenated",
  "description": {"flavor": "full narrative description paragraphs", "short": "one-sentence summary"},
  "age": "age text",
  "size": "size text",
  "speed": "speed text",
  "traits": [
    {"name": "Trait Name", "identifier": "lineage-trait-name", "type": "feature", "img": "", "description": "EXACT mechanics text — do not paraphrase"}
  ]
}

RULES: Each trait is separate. Speed/Size go in top fields, NOT traits. identifier unique, prefixed.

--- TEXT ---

"""

HERITAGE_PROMPT = """Extract this Black Flag heritage into JSON. Output ONLY valid JSON — no markdown.

{
  "name": "HERITAGE NAME",
  "identifier": "lowercase-hyphenated",
  "description": {"flavor": "full narrative description", "short": "one-sentence summary"},
  "traits": [
    {"name": "Trait Name", "identifier": "heritage-trait-name", "type": "feature", "img": "", "description": "EXACT mechanics — do not paraphrase"}
  ],
  "languages": "languages text"
}

RULES: Extract EVERY trait. identifier unique, prefixed with heritage name.

--- TEXT ---

"""

BG_PROMPT = """Extract this Black Flag background into JSON. Output ONLY valid JSON.

{
  "name": "NAME",
  "identifier": "lowercase-hyphenated",
  "description": {"flavor": "narrative description", "short": "one-sentence"},
  "skillProficiencies": "skills text",
  "additionalProficiencies": "additional profs text",
  "equipment": "equipment text",
  "talents": "talent options",
  "adventuringMotivationTable": [{"roll": "1", "text": "..."}]
}

--- TEXT ---

"""


def run_claude(prompt: str, max_turns: int = 2) -> str:
    result = subprocess.run(
        ["claude", "-p", "--output-format", "json", "--max-turns", str(max_turns),
         "Extract RPG content into the JSON format shown. Output ONLY JSON. No markdown. No fences."],
        input=prompt, capture_output=True, text=True,
        timeout=CLAUDE_TIMEOUT,
        env={**os.environ, "HOME": HOME},
    )
    if result.returncode != 0 and not result.stdout.strip():
        raise RuntimeError(f"Claude error: {result.stderr[:300]}")
    return result.stdout


def parse_json(output: str) -> dict:
    try:
        wrapper = json.loads(output)
        if "result" in wrapper and isinstance(wrapper["result"], str):
            text = wrapper["result"]
            text = re.sub(r'^```(?:json)?\s*\n', '', text)
            text = re.sub(r'\n```\s*$', '', text)
            parsed = json.loads(text)
            # Claude sometimes wraps in an array — take first element
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed[0]
            return parsed
        return wrapper
    except (json.JSONDecodeError, KeyError) as e:
        raise RuntimeError(f"Parse error: {e}")


def extract_lineage(item):
    output = run_claude(LINEAGE_PROMPT + item["text"][:8000])
    data = parse_json(output)
    data.setdefault("folder", "Lineages")
    data.setdefault("img", "")
    return data


def extract_heritage(item):
    output = run_claude(HERITAGE_PROMPT + item["text"][:6000])
    data = parse_json(output)
    data.setdefault("folder", "Heritages")
    data.setdefault("img", "")
    return data


def extract_background(item):
    output = run_claude(BG_PROMPT + item["text"][:6000])
    data = parse_json(output)
    data.setdefault("folder", "Backgrounds")
    data.setdefault("img", "")
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--output", "-o")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--sequential", action="store_true")
    args = parser.parse_args()

    if args.validate_only:
        path = args.output or str(Path(args.pdf).with_suffix(".json"))
        with open(path) as f:
            data = json.load(f)
        print(f"✅ {len(data.get('lineages',[]))} lineages, "
              f"{len(data.get('heritages',[]))} heritages, "
              f"{len(data.get('backgrounds',[]))} backgrounds")
        return

    print(f"📄 {args.pdf}")
    text = pdftotext(args.pdf)
    print(f"   {len(text):,} chars")

    items = split_items(text)
    print(f"   {len(items['lineages'])} lineages, "
          f"{len(items['heritages'])} heritages, "
          f"{len(items['backgrounds'])} backgrounds")

    data = {"lineages": [], "heritages": [], "backgrounds": []}
    errors = []
    workers = 1 if args.sequential else MAX_WORKERS

    print(f"\n🧬 Lineages:")
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(extract_lineage, i): i["name"] for i in items["lineages"]}
        for f in concurrent.futures.as_completed(futures):
            name = futures[f]
            try:
                r = f.result()
                data["lineages"].append(r)
                print(f"   ✅ {name}: {len(r.get('traits',[]))} traits")
            except Exception as e:
                print(f"   ❌ {name}: {e}")
                errors.append(f"lineage:{name}:{e}")

    print(f"\n🏛️  Heritages:")
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(extract_heritage, i): i["name"] for i in items["heritages"]}
        for f in concurrent.futures.as_completed(futures):
            name = futures[f]
            try:
                r = f.result()
                data["heritages"].append(r)
                print(f"   ✅ {name}: {len(r.get('traits',[]))} traits")
            except Exception as e:
                print(f"   ❌ {name}: {e}")
                errors.append(f"heritage:{name}:{e}")

    print(f"\n📋 Backgrounds:")
    for item in items["backgrounds"]:
        try:
            r = extract_background(item)
            data["backgrounds"].append(r)
            print(f"   ✅ {item['name']}")
        except Exception as e:
            print(f"   ❌ {item['name']}: {e}")

    lt = sum(len(l.get("traits", [])) for l in data["lineages"])
    ht = sum(len(h.get("traits", [])) for h in data["heritages"])
    print(f"\n📊 {len(data['lineages'])} lineages ({lt} traits), "
          f"{len(data['heritages'])} heritages ({ht} traits), "
          f"{len(data['backgrounds'])} backgrounds")
    if errors:
        print(f"⚠️  {len(errors)} errors")

    output = args.output or str(Path(args.pdf).with_suffix(".json"))
    with open(output, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"💾 {output}")


if __name__ == "__main__":
    main()
