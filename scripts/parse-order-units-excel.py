"""Parse « Unité de commande.xlsx » → JSON stdout."""
import json
import sys

import openpyxl

path = sys.argv[1]
ws = openpyxl.load_workbook(path, data_only=True).active
entries = []
vendors_by_col: dict[int, str] = {}

for row in ws.iter_rows(values_only=True):
    row = list(row) + [None] * 26
    for start in range(0, 25, 5):
        ar = row[start]
        fr = row[start + 1]
        code = row[start + 2]
        nom = row[start + 3]
        unit = row[start + 4]
        if fr is not None and str(fr).strip() == "Français":
            vendor_name = str(ar or row[start] or "").strip()
            if vendor_name:
                vendors_by_col[start] = vendor_name
            continue
        if code is None or str(code).strip() == "":
            continue
        try:
            code_i = int(float(code))
        except (TypeError, ValueError):
            continue
        entries.append(
            {
                "code": code_i,
                "nom": str(nom or "").strip(),
                "unit": str(unit or "").strip(),
                "ar": str(ar or "").strip(),
                "vendeur": vendors_by_col.get(start, ""),
            }
        )

print(json.dumps(entries, ensure_ascii=False))
