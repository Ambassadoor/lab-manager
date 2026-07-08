import json
import pubchempy as pcp

BATCH_SIZE = 50
INPUT_FILE = "data.json"
OUTPUT_FILE = "data_with_properties.json"
PROPERTY_FIELDS = ["title", "molecularweight", "molecularformula", "iupacname"]


# Script for importing chemical data from pubchem
def normalize_cids(raw_cids):
    """Return a clean list of integer CIDs from mixed input shapes."""
    if raw_cids is None:
        return []

    if isinstance(raw_cids, int):
        return [raw_cids]

    if isinstance(raw_cids, list):
        normalized = []
        for value in raw_cids:
            if isinstance(value, int):
                normalized.append(value)
            elif isinstance(value, str) and value.isdigit():
                normalized.append(int(value))
        return normalized

    return []


with open(INPUT_FILE, "r", encoding="utf-8") as file:
    data = json.load(file)

cas_keys = list(data.keys())
cas_to_output = {}

# Initialize output with each CAS and its source CIDs.
for cas in cas_keys:
    cas_to_output[cas] = {
        "cids": normalize_cids(data.get(cas)),
        "properties": [],
    }

for start_index in range(0, len(cas_keys), BATCH_SIZE):
    batch_cas = cas_keys[start_index : start_index + BATCH_SIZE]

    cid_to_cas = {}
    batch_cids = []

    for cas in batch_cas:
        for cid in cas_to_output[cas]["cids"]:
            batch_cids.append(cid)
            cid_to_cas.setdefault(cid, []).append(cas)

    if not batch_cids:
        continue

    properties = pcp.get_properties(PROPERTY_FIELDS, batch_cids)

    for item in properties:
        cid = item.get("CID")
        if cid is None:
            continue

        for cas in cid_to_cas.get(cid, []):
            cas_to_output[cas]["properties"].append(
                {
                    "cid": cid,
                    "title": item.get("Title"),
                    "molecular_weight": item.get("MolecularWeight"),
                    "molecular_formula": item.get("MolecularFormula"),
                    "iupac_name": item.get("IUPACName"),
                }
            )

with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
    json.dump(cas_to_output, file, indent=4)

print(f"Saved mapped PubChem data to {OUTPUT_FILE}")
