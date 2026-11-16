#!/usr/bin/env python3
"""Turn a saved copy of a legal page into the data this site prints it from.

The Money Tycoon privacy policy and terms of service are published at
https://mubashiralee.github.io/moneytycoon.app/ (the apps link there). This
site shows the same two documents in its own design. The wording must be the
same, word for word, so nobody retypes it: this tool reads a saved copy of the
published page and writes its content out as data, and it refuses to write
anything unless every word of the page is in the data, in the same order.

    python3 -I tools/import-legal.py <saved page.html> <published address> <date saved> <out.json>

    python3 -I tools/import-legal.py legal/money-tycoon/source/privacy-policy.html \
        https://mubashiralee.github.io/moneytycoon.app/privacy-policy 2026-11-15 \
        legal/money-tycoon/privacy-policy.json

Then run `node tools/make-legal.mjs` to print the pages again.

The saved page is read as data only: nothing in it is run. `-I` keeps Python
from loading code that happens to sit beside it.
"""

import json
import re
import sys
from html.parser import HTMLParser

# What a legal page may be made of. Anything else stops the import, so that a
# new kind of content is looked at by a person instead of being dropped.
BLOCKS = {"h1", "h2", "h3", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "div", "hr"}
INLINE = {"strong", "em", "code", "a", "br"}
EMPTY = {"hr", "br"}
KEPT = {"class": "cls", "id": "id", "href": "href"}
DROPPED = {"style"}  # how the old page was painted; this site has its own design
OUTSIDE = {"html", "head", "body", "meta", "title", "style", "link"}


class Reader(HTMLParser):
    """Builds the tree of the page's body, and separately keeps every piece of text it passes."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {"t": "body", "c": []}
        self.open = [self.root]
        self.in_body = False
        self.skipping = None  # inside <style> or <title>: their text is not content
        self.title = ""
        self.raw = []  # every piece of body text, as written
        self.dropped = []

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.in_body = True
            return
        if tag in ("style", "title", "script"):
            if tag == "script":
                raise SystemExit("the page has a <script>; a legal page should have none")
            self.skipping = tag
            return
        if tag in OUTSIDE:
            return
        if not self.in_body:
            raise SystemExit(f"<{tag}> outside the body")
        if tag not in BLOCKS and tag not in INLINE:
            raise SystemExit(f"this tool does not know <{tag}>; add it on purpose or change the page")
        node = {"t": tag}
        for name, value in attrs:
            if name in KEPT:
                node[KEPT[name]] = value
            elif name in DROPPED:
                self.dropped.append(f"<{tag} {name}=\"{value}\">")
            else:
                raise SystemExit(f"this tool does not know the attribute {name} on <{tag}>")
        self.open[-1]["c"].append(node)
        if tag != "br" and tag in INLINE:
            pass  # bold, a link, a piece of code: the word carries on through it
        else:
            self.raw.append(" ")  # a block or a line break separates words, as it does on screen
        if tag in EMPTY:
            return
        node["c"] = []
        self.open.append(node)

    def handle_endtag(self, tag):
        if tag in ("style", "title"):
            self.skipping = None
            return
        if tag == "body":
            self.in_body = False
            return
        if tag in OUTSIDE or tag in EMPTY:
            return
        if self.open[-1]["t"] != tag:
            raise SystemExit(f"</{tag}> closes <{self.open[-1]['t']}>: the page's tags do not nest")
        self.open.pop()
        if tag in BLOCKS:
            self.raw.append(" ")

    def handle_data(self, data):
        if self.skipping == "title":
            self.title += data
            return
        if self.skipping or not self.in_body:
            return
        self.raw.append(data)
        self.open[-1]["c"].append(data)


def tidy(node):
    """Collapse the page's line breaks and indents to single spaces, and trim the edges of blocks."""
    children = []
    for child in node.get("c", []):
        if isinstance(child, str):
            text = re.sub(r"\s+", " ", child)
            if children and isinstance(children[-1], str):
                children[-1] = re.sub(r"\s+", " ", children[-1] + text)
            else:
                children.append(text)
        else:
            tidy(child)
            children.append(child)

    def edge(sibling):
        return sibling is None or (not isinstance(sibling, str) and (sibling["t"] in BLOCKS or sibling["t"] == "br"))

    if node["t"] in BLOCKS or node["t"] == "body":
        out = []
        for at, child in enumerate(children):
            if isinstance(child, str):
                before = children[at - 1] if at > 0 else None
                after = children[at + 1] if at + 1 < len(children) else None
                if edge(before):
                    child = child.lstrip()
                if edge(after):
                    child = child.rstrip()
                if not child:
                    continue
            out.append(child)
        children = out
    if "c" in node:
        node["c"] = children


def words_of(node, out):
    """The data's words in order: blocks and line breaks separate words, inline tags do not."""
    if isinstance(node, str):
        out.append(node)
        return
    apart = node["t"] in BLOCKS or node["t"] in ("br", "body")
    if apart:
        out.append(" ")
    for child in node.get("c", []):
        words_of(child, out)
    if apart:
        out.append(" ")


def main():
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    saved, address, date, out_path = sys.argv[1:]
    if not re.fullmatch(r"https://[^\s?#]+", address):
        raise SystemExit(f"the published address must be a plain https address, not {address}")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise SystemExit(f"the date saved must look like 2026-11-15, not {date}")

    reader = Reader()
    with open(saved, encoding="utf-8") as page:
        reader.feed(page.read())
    reader.close()
    if len(reader.open) != 1:
        raise SystemExit(f"<{reader.open[-1]['t']}> is never closed")
    tidy(reader.root)

    # The proof: every word of the page, in order, is in the data.
    theirs = "".join(reader.raw).split()
    ours = []
    words_of(reader.root, ours)
    ours = "".join(ours).split()
    if theirs != ours:
        for at, (a, b) in enumerate(zip(theirs, ours)):
            if a != b:
                raise SystemExit(f"word {at} differs: the page says {a!r}, the data says {b!r}")
        raise SystemExit(f"the page has {len(theirs)} words, the data has {len(ours)}")
    if not theirs:
        raise SystemExit("the page has no words")

    data = {
        "source": address,
        "saved": date,
        "pageTitle": " ".join(reader.title.split()),
        "words": len(theirs),
        "body": reader.root["c"],
    }
    with open(out_path, "w", encoding="utf-8") as out:
        json.dump(data, out, ensure_ascii=False, indent=1)
        out.write("\n")
    print(f"{out_path}: {len(theirs)} words, the same as the page, in the same order")
    for item in reader.dropped:
        print(f"  left out (old paint): {item}")


if __name__ == "__main__":
    main()
