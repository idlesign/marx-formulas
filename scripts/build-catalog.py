#!/usr/bin/env python3
"""Build the offline browser catalog from 0formulas.md without shortening it.

Formula/translation headings become id/title fields; their full bodies become
markdown. Group headings become groups. All other prose stays in intro/scope.
Standalone navigation anchors are removed. PDF references become non-clickable
bibliographic citations; the browser never needs the research files themselves.
No Markdown or TeX rendering is performed by this script.
"""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "0formulas.md"
DESTINATION = ROOT / "stand" / "catalog.js"
HEADING = re.compile(r"^#{1,3} .+$", re.MULTILINE)
GROUP = re.compile(r"## (\d+)\. (.+)")
FORMULA = re.compile(r"### (F\d{3})\. (.+)")
TRANSLATION = re.compile(r"### (TR-\d{2})\. (.+)")
ANCHOR = re.compile(r'^\s*<a id="[a-z0-9-]+"></a>\s*$', re.MULTILINE)
MARKDOWN_LINK = re.compile(r"\[([^\]\n]+)\]\(((?:[^()\n]|\([^()\n]*\))*)\)")
VOLUME_FILE = re.compile(r"\btom_(\d+)(?:_([IVX]+))?\.pdf\b", re.IGNORECASE)
PDF_URL = re.compile(r"(?:https?://|file:/)[^\s<>\]\"']+\.pdf(?:[?#][^\s<>\]\"']*)?", re.IGNORECASE)


def volume_citation(match):
    """Use an edition/volume name, never expose the repository's PDF filename."""
    part = f", ч. {match[2].upper()}" if match[2] else ""
    return f"Маркс, Энгельс. Сочинения, 2-е изд., т. {int(match[1])}{part}"


def source_label(label, url):
    """Retain an informative external PDF title, with an explicit page locator."""
    parsed = urlsplit(url)
    original_label = label
    label = re.sub(r"\bPDF\b[\s,:;—-]*", "", label, flags=re.IGNORECASE).strip()
    if not label or re.search(r"\.pdf(?:$|[?#])", label, re.IGNORECASE):
        mega = re.search(r"MEGA[²2]?[ ._-]*([IVX]+)[./_-](\d+(?:\.\d+)?)", unquote(parsed.path), re.IGNORECASE)
        label = f"MEGA², {mega[1].upper()}/{mega[2]}" if mega else "Цифровая копия источника"
    page = parse_qs(parsed.fragment).get("page", [])
    if page and not digital_page_in_label(original_label, page[0]):
        label += f" (страница цифровой копии: {page[0]})"
    return label


def digital_page_in_label(label, page):
    """A printed page in a title does not replace the PDF's distinct page index."""
    locator = re.search(r"(?:PDF|цифровая копия|цифровое воспроизведение)[^\n]*?(?:с\.|стр\.|page)\s*(\d+)(?:[–-](\d+))?", label, re.IGNORECASE)
    if not locator or not page.isdigit():
        return False
    return int(locator[1]) <= int(page) <= int(locator[2] or locator[1])


def bibliographic_link(match):
    label, url = match[1], match[2]
    original_label = label
    decoded = unquote(url)
    volume = VOLUME_FILE.search(decoded)
    if volume and urlsplit(decoded).scheme in ("", "file"):
        citation = volume_citation(volume)
        # File labels and bare volume labels contain no information beyond the citation.
        if VOLUME_FILE.fullmatch(label) or re.fullmatch(r"(?:т\.|том)\s*\d+(?:[-, ]+(?:ч\.?\s*)?[IVX]+)?", label, re.IGNORECASE):
            label = ""
        else:
            label = re.sub(r"\bPDF\b", "цифровая копия", label, flags=re.IGNORECASE)
        page = parse_qs(urlsplit(decoded).fragment).get("page", [])
        if page and not digital_page_in_label(original_label, page[0]):
            if label and "цифровая копия" not in label:
                label += f"; страница цифровой копии: {page[0]}"
            else:
                label = f"{label}, с. {page[0]}" if label else f"цифровая копия, с. {page[0]}"
        return citation + (f" ({label})" if label else "")
    if re.search(r"\.pdf(?:$|[?#])", decoded, re.IGNORECASE):
        return source_label(label, decoded)
    if re.search(r"(?:^|/)0formulas\.md(?:$|[?#])", decoded):
        fragment = urlsplit(decoded).fragment
        return f"[{label}](#{fragment})" if fragment else label
    return match[0]


def clean_markdown(text):
    """Preserve the argument and page locators, publish source names instead of PDFs."""
    text = ANCHOR.sub("", text)
    text = MARKDOWN_LINK.sub(bibliographic_link, text)
    # Also handle Markdown autolinks and a bare PDF URL if a source adds one later.
    text = re.sub(r"<((?:https?://|file:/)[^<>]+\.pdf(?:[?#][^<>]*)?)>",
                  lambda match: source_label("", unquote(match[1])), text, flags=re.IGNORECASE)
    text = PDF_URL.sub(lambda match: source_label("", unquote(match[0])), text)
    text = VOLUME_FILE.sub(volume_citation, text)
    return text.strip("\n")


def build_catalog(source):
    headings = list(HEADING.finditer(source))
    first_group = next(
        (index for index, heading in enumerate(headings) if GROUP.fullmatch(heading[0])),
        None,
    )
    if first_group is None:
        raise ValueError("No thematic group headings found in 0formulas.md")

    catalog = {
        "groups": [],
        "formulas": [],
        "translations": [],
        "intro": clean_markdown(source[: headings[first_group].start()]),
        "scope": "",
        "assessmentScale": [
            "математических проблем при указанных условиях не выявлено",
            "оговорка точности, обозначений или вырожденных случаев",
            "математически существенная неоднозначность определения или чтения",
            "неполнота формулы или существенная неявная нормировка",
            "условная несовместимость связанных формул при буквальном совмещении",
            "конкретная неверная арифметика, знак или размерность приведённого варианта",
        ],
        "assessmentMethod": (
            "Оценка относится к наиболее проблемному реально приведённому варианту семейства. "
            "Она не переносится автоматически на исправленную формулу, другие варианты или автора. "
            "E0 означает, что в рамках описанной проверки математических проблем не выявлено, "
            "а не что экономическая теория доказана."
        ),
    }
    scope = []
    current_group = None
    for index in range(first_group, len(headings)):
        heading = headings[index]
        end = headings[index + 1].start() if index + 1 < len(headings) else len(source)
        body = clean_markdown(source[heading.end() : end])
        group = GROUP.fullmatch(heading[0])
        formula = FORMULA.fullmatch(heading[0])
        translation = TRANSLATION.fullmatch(heading[0])

        if group:
            if body:
                raise ValueError(f"Unexpected unassigned prose after group {group[1]}")
            current_group = int(group[1])
            catalog["groups"].append({"id": current_group, "title": group[2]})
        elif formula:
            if current_group is None:
                raise ValueError(f"Formula {formula[1]} has no thematic group")
            metadata = {}
            for name, label in [
                ("context", "Контекст"),
                ("level", "Математическая сомнительность"),
                ("target", "Объект оценки"),
                ("reason", "Основание оценки"),
            ]:
                match = re.search(rf"^\*\*{label}:\*\* (.+)$", body, re.MULTILINE)
                if not match:
                    raise ValueError(f"Missing {label} in {formula[1]}")
                metadata[name] = match[1]
            if not re.fullmatch(r"E[0-5]", metadata["level"]):
                raise ValueError(f"Invalid mathematical assessment in {formula[1]}")
            attribution = {}
            for name, label in [
                ("label", "Атрибуция оценки"),
                ("detail", "Пояснение атрибуции"),
                ("preview", "Подпись формулы в карточке"),
            ]:
                match = re.search(rf"^\*\*{label}:\*\* (.+)$", body, re.MULTILINE)
                if match:
                    attribution[name] = match[1]
            if (attribution and len(attribution) != 3) or (metadata["level"] != "E0" and not attribution):
                raise ValueError(f"Missing assessment attribution in {formula[1]}")
            catalog["formulas"].append(
                {
                    "id": formula[1],
                    "title": formula[2],
                    "group": current_group,
                    "markdown": body,
                    "context": metadata["context"],
                    "assessment": {
                        "level": int(metadata["level"][1]),
                        "target": metadata["target"],
                        "reason": metadata["reason"],
                        **({"attribution": attribution} if attribution else {}),
                    },
                    "searchText": " ".join(f"{formula[1]} {formula[2]} {body}".split()).lower(),
                }
            )
        elif translation:
            current_group = None
            catalog["translations"].append(
                {"id": translation[1], "title": translation[2], "markdown": body}
            )
        else:
            # Includes the translation introduction, its source-critical caveat,
            # the discrepancy index and the complete corpus/source register.
            current_group = None
            scope.append(clean_markdown(source[heading.start() : end]))

    catalog["scope"] = "\n\n".join(scope)
    validate_catalog(catalog)
    return catalog


def validate_catalog(catalog):
    expected_formulas = [f"F{number:03d}" for number in range(1, 102)]
    expected_translations = [f"TR-{number:02d}" for number in range(1, 8)]
    if [item["id"] for item in catalog["formulas"]] != expected_formulas:
        raise ValueError("Expected exactly F001–F101 in source order")
    if [item["id"] for item in catalog["groups"]] != list(range(1, 15)):
        raise ValueError("Expected exactly 14 consecutive thematic groups")
    if [item["id"] for item in catalog["translations"]] != expected_translations:
        raise ValueError("Expected exactly TR-01–TR-07 in source order")
    for formula in catalog["formulas"]:
        if "Математическое противоречие" not in formula["markdown"]:
            raise ValueError(f"Missing contradiction assessment in {formula['id']}")
    if re.search(r"\]\(/(?:home|Users|tmp)/", json.dumps(catalog, ensure_ascii=False)):
        raise ValueError("An absolute local Markdown link was not rewritten")
    published = json.dumps(catalog, ensure_ascii=False)
    if VOLUME_FILE.search(published) or PDF_URL.search(published):
        raise ValueError("A PDF filename or URL was exposed in the public catalog")
    if re.search(r"\]\([^)]*\.pdf(?:[?#][^)]*)?\)", published, re.IGNORECASE):
        raise ValueError("A clickable PDF link was exposed in the public catalog")


def render_catalog(catalog):
    payload = json.dumps(catalog, ensure_ascii=False, indent=2)
    # Keep the generated file valid even for older classic-script parsers.
    payload = payload.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return (
        "// Generated from ../0formulas.md by scripts/build-catalog.py; do not edit.\n"
        f"globalThis.FORMULA_CATALOG = {payload};\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if catalog.js is not up to date")
    arguments = parser.parse_args()
    rendered = render_catalog(build_catalog(SOURCE.read_text(encoding="utf-8")))
    if arguments.check:
        if not DESTINATION.exists() or DESTINATION.read_bytes() != rendered.encode("utf-8"):
            parser.exit(1, "catalog.js is out of date; run scripts/build-catalog.py\n")
    else:
        DESTINATION.write_text(rendered, encoding="utf-8", newline="\n")
    print("Catalog verified: 101 formulas, 14 groups, 7 translation notes.")


if __name__ == "__main__":
    main()
