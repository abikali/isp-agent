#!/usr/bin/env python3
"""
Parse the pre-cleanup pg_dump and emit a TSV of:
  customer.id <TAB> address <TAB> firstName <TAB> lastName <TAB> mobile <TAB> phones_json

for dotnet2 (org otoo1g7z3b3e9mai4p3snchd) customers that were LINKED
(externalId IS NOT NULL) at the time of the dump.

These are the values that existed before the merge clobbered them. We'll use
this TSV to selectively restore the fields the merge over-wrote on rows the
dealer never actually edited.

Usage:
  python3 restore-dotnet2-addresses.py < full-tables.sql > pre_merge_linked.tsv
"""
import re
import sys
import json

DOTNET2_ORG = "otoo1g7z3b3e9mai4p3snchd"
INSERT_PREFIX = "INSERT INTO public.customer ("


def parse_sql_values(s: str):
    """Return list of literal values from a `VALUES (...)` clause body, handling
    Postgres-style escaped single quotes (`''`)."""
    out = []
    i = 0
    n = len(s)
    while i < n:
        # skip whitespace and commas
        while i < n and s[i] in " ,\t\n":
            i += 1
        if i >= n:
            break
        c = s[i]
        if c == "'":
            # quoted string
            i += 1
            buf = []
            while i < n:
                if s[i] == "'":
                    if i + 1 < n and s[i + 1] == "'":
                        buf.append("'")
                        i += 2
                        continue
                    i += 1
                    break
                buf.append(s[i])
                i += 1
            out.append("".join(buf))
        else:
            # unquoted literal (NULL, number, true/false)
            buf = []
            while i < n and s[i] not in ",":
                buf.append(s[i])
                i += 1
            tok = "".join(buf).strip()
            out.append(None if tok.upper() == "NULL" else tok)
    return out


def main():
    columns = None
    for line in sys.stdin:
        if not line.startswith(INSERT_PREFIX):
            continue
        # Parse columns once (they're identical in every row of this dump).
        if columns is None:
            col_match = re.match(r"INSERT INTO public\.customer \((.*?)\) VALUES",
                                  line)
            if not col_match:
                continue
            raw = col_match.group(1)
            # split by comma respecting "double-quoted" identifiers
            cols = []
            buf = []
            in_q = False
            for ch in raw:
                if ch == '"':
                    in_q = not in_q
                    continue
                if ch == "," and not in_q:
                    cols.append("".join(buf).strip())
                    buf = []
                    continue
                buf.append(ch)
            if buf:
                cols.append("".join(buf).strip())
            columns = cols
        # Get the VALUES tuple body
        v_match = re.search(r"VALUES \((.*)\);\s*$", line)
        if not v_match:
            continue
        values = parse_sql_values(v_match.group(1))
        if len(values) != len(columns):
            print(f"COL MISMATCH: {len(values)} vs {len(columns)}",
                  file=sys.stderr)
            continue
        row = dict(zip(columns, values))
        if row.get("organizationId") != DOTNET2_ORG:
            continue
        if not row.get("externalId"):
            continue  # skip pre-cleanup seed twins; we want pre-merge linked
        fields = [
            row.get("id") or "",
            row.get("address") or "",
            row.get("firstName") or "",
            row.get("lastName") or "",
            row.get("mobile") or "",
            row.get("phones") or "[]",
            row.get("latitude") or "",
            row.get("longitude") or "",
        ]
        # No tabs/newlines in addresses please
        fields = [f.replace("\t", " ").replace("\n", " ").replace("\r", " ")
                  for f in fields]
        print("\t".join(fields))


if __name__ == "__main__":
    main()
