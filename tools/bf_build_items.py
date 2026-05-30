#!/usr/bin/env python3
"""
Black Flag PDF → Foundry Item Builder
Creates lineages, heritages, and backgrounds from extracted JSON data.
Uses mcp_foundry_execute_script to create items with correct advancement structures.

Usage: python3 build_items.py
"""

import json
import subprocess
import sys

DATA_FILE = "/tmp/lineages_heritages_extracted.json"

# ── Load extracted data ──────────────────────────────────────────────
with open(DATA_FILE) as f:
    data = json.load(f)

lineages = data["lineages"]
heritages = data["heritages"]
backgrounds = data["backgrounds"]

# ── Helper ───────────────────────────────────────────────────────────
def exec_script(script):
    """Run JavaScript in Foundry via MCP tool and return parsed result."""
    import urllib.request, urllib.parse
    # Use Hermes MCP tool
    cmd = [
        "npx", "-y", "mcporter", "call", 
        "--output", "json",
        "foundry.execute-script", f"script={script}"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return json.loads(result.stdout)

# ── Generate items ───────────────────────────────────────────────────
BOOK_ID = "KP-LH1"
BOOK_LABEL = "Lineages & Heritages Supplement 1"
PACK_LINEAGE = "black-flag-shared.lineages"
PACK_HERITAGE = "black-flag-shared.heritages"
PACK_BACKGROUND = "black-flag-shared.backgrounds"

def make_source():
    return {"book": BOOK_ID, "custom": BOOK_LABEL}

def desc_to_html(desc_obj):
    """Convert extracted description to Foundry HTML."""
    flavor = desc_obj.get("flavor", "")
    short = desc_obj.get("short", "")
    html = f"<p>{short}</p>"
    if flavor:
        html += f"<hr><p>{flavor}</p>"
    return html

def build_property_advancement(key_path, mode, value):
    """Build a property advancement configuration."""
    return {
        "type": "property",
        "level": {"value": 0, "classIdentifier": ""},
        "configuration": {
            "changes": [{"key": key_path, "mode": mode, "value": value}]
        },
        "title": "",
        "icon": None
    }

# ── Trait mapping: extracted trait → property advancement ───────────
# Maps trait identifiers to their property changes
TRAIT_PROPERTY_MAP = {
    # Lineage traits
    "dryad-darkvision": [
        (4, "system.traits.senses.types.darkvision", "60")
    ],
    "dhampir-darkvision": [
        (4, "system.traits.senses.types.darkvision", "60")
    ],
    "gnoll-darkvision": [
        (4, "system.traits.senses.types.darkvision", "60")
    ],
    "goblin-darkvision": [
        (4, "system.traits.senses.types.darkvision", "60")
    ],
    "dhampir-vampiric-resilience": [
        (2, "system.traits.damage.resistances.value", "necrotic"),
    ],
    "dhampir-dark-thirst": [
        # Natural weapon — handled as scaleValue or trait
    ],
    # Heritage traits
    "mangrove-regent-venom-tolerance": [
        (2, "system.traits.damage.resistances.value", "poison"),
        (2, "system.traits.condition.resistances.value", "poisoned"),
    ],
    "pine-scion-scale-the-branches": [
        (5, "system.traits.movement.types.climb", "@base"),
    ],
    "rain-creeper-pine-runner": [
        # Speed +5 and climb speed — needs custom handling
    ],
    "wastelander-alien-mind": [
        (2, "system.traits.damage.resistances.value", "psychic"),
    ],
    "wastelander-retractable-claws": [
        # Natural weapon
    ],
    "wastelander-long-limbs": [
        # Speed +10, reach
    ],
    "wastelander-temblor": [
        (4, "system.traits.senses.types.tremorsense", "10"),
    ],
    "wastelander-radiation-eater": [
        (2, "system.traits.damage.resistances.value", "poison"),
    ],
    "wastelander-thickened-skin": [
        # Choice of elemental resistance
    ],
    "badlander-iron-guts": [
        (2, "system.traits.condition.resistances.value", "poisoned"),
    ],
}

# ── Build the full creation script ──────────────────────────────────
def build_creation_script():
    """Generate JavaScript to create all items."""
    
    # First pass: define all feature items
    feature_items_code = []
    lineage_items_code = []
    heritage_items_code = []
    background_items_code = []
    
    # Track UUIDs: lineage_name → [feature_uuids]
    lineage_features = {}
    # Track UUIDs: heritage_name → [feature_uuids]
    heritage_features = {}
    
    feature_id = 0
    
    def js_str(s):
        return json.dumps(s)
    
    def js_obj(d):
        return json.dumps(d)
    
    # Process lineages
    for lineage in lineages:
        name = lineage["name"]
        lid = lineage["identifier"]
        features = lineage["traits"]
        feature_uuids = []
        
        for feat in features:
            fid = feat["identifier"]
            fname = feat["name"]
            fdesc = feat["description"]
            
            # Build advancement
            advs = {}
            if fid in TRAIT_PROPERTY_MAP:
                for mode, key, val in TRAIT_PROPERTY_MAP[fid]:
                    adv_id = f"a_{lid}_{mode}_{key.replace('.', '_').replace('system_traits_', '')}"
                    advs[adv_id] = {
                        "type": "property",
                        "level": {"value": 0, "classIdentifier": ""},
                        "configuration": {
                            "changes": [{"key": key, "mode": mode, "value": val}]
                        },
                        "title": "",
                        "icon": None
                    }
            
            # Feature item
            item_js = {
                "name": fname,
                "type": "feature",
                "system": {
                    "description": {"value": f"<p>{fdesc}</p>"},
                    "source": make_source(),
                }
            }
            if advs:
                item_js["system"]["advancement"] = advs
            
            feature_items_code.append(item_js)
            # UUID will be: Compendium.black-flag-shared.lineages.Item.{ID}
            # We need to pre-generate IDs or track after creation
            feature_uuids.append(f"FEAT_{lid}_{fid}")
            feature_id += 1
        
        lineage_features[lid] = feature_uuids
        
        # Lineage item
        size_options = ["medium", "small"] if "Small" in lineage.get("size", "") else ["medium"]
        speed = lineage.get("speed", "Your base walking speed is 30 feet.")
        
        lineage_js = {
            "name": name,
            "type": "lineage",
            "system": {
                "description": {"value": desc_to_html(lineage["description"])},
                "source": make_source(),
            }
        }
        lineage_items_code.append(lineage_js)
    
    # Process heritages
    for heritage in heritages:
        hname = heritage["name"]
        hid = heritage["identifier"]
        features = heritage["traits"]
        languages = heritage.get("languages", "You know Common and one additional language of your choice.")
        
        h_feature_uuids = []
        for feat in features:
            fid = feat["identifier"]
            fname = feat["name"]
            fdesc = feat["description"]
            
            advs = {}
            if fid in TRAIT_PROPERTY_MAP:
                for mode, key, val in TRAIT_PROPERTY_MAP[fid]:
                    advs[f"a_{hid}_{mode}"] = {
                        "type": "property",
                        "level": {"value": 0, "classIdentifier": ""},
                        "configuration": {
                            "changes": [{"key": key, "mode": mode, "value": val}]
                        },
                        "title": "",
                        "icon": None
                    }
            
            item_js = {
                "name": fname,
                "type": "feature",
                "system": {
                    "description": {"value": f"<p>{fdesc}</p>"},
                    "source": make_source(),
                }
            }
            if advs:
                item_js["system"]["advancement"] = advs
            
            feature_items_code.append(item_js)
            h_feature_uuids.append(f"FEAT_{hid}_{fid}")
        
        heritage_features[hid] = h_feature_uuids
        
        # Heritage item
        heritage_js = {
            "name": hname,
            "type": "heritage",
            "system": {
                "description": {"value": desc_to_html(heritage["description"])},
                "source": make_source(),
                "advancement": {
                    "lang": {
                        "type": "trait",
                        "level": {"value": 0},
                        "configuration": {
                            "grants": ["languages:standard:common"],
                            "choices": [{"count": 1, "pool": ["languages:*"]}],
                            "mode": "default",
                            "choiceMode": "inclusive"
                        },
                        "title": "Languages",
                        "icon": None
                    },
                    # grantFeatures will be populated after feature IDs known
                }
            }
        }
        heritage_items_code.append(heritage_js)
    
    # Process backgrounds
    for bg in backgrounds:
        bgname = bg["name"]
        bgdesc = desc_to_html(bg["description"])
        skills = bg.get("skillProficiencies", "")
        additional = bg.get("additionalProficiencies", "")
        
        bg_js = {
            "name": bgname,
            "type": "background",
            "system": {
                "description": {"value": bgdesc},
                "source": make_source(),
                "advancement": {
                    "skills": {
                        "type": "trait",
                        "level": {"value": 0},
                        "configuration": {
                            "choices": [{"count": 2, "pool": ["skills:history", "skills:insight", "skills:investigation", "skills:sleightOfHand"]}],
                            "mode": "default",
                            "grants": [],
                            "choiceMode": "inclusive"
                        },
                        "title": "Skill Proficiencies"
                    },
                    "tools": {
                        "type": "trait",
                        "level": {"value": 0},
                        "configuration": {
                            "choices": [
                                {"count": 1, "pool": ["languages:*"]},
                                {"count": 1, "pool": ["tools:trapper"]}
                            ],
                            "mode": "default",
                            "grants": [],
                            "choiceMode": "inclusive"
                        },
                        "title": "Additional Proficiencies"
                    }
                }
            }
        }
        background_items_code.append(bg_js)
    
    return {
        "features": feature_items_code,
        "lineages": lineage_items_code,
        "heritages": heritage_items_code,
        "backgrounds": background_items_code,
        "lineage_feature_map": lineage_features,
        "heritage_feature_map": heritage_features,
    }

plan = build_creation_script()

print(f"Features to create: {len(plan['features'])}")
print(f"Lineages to create: {len(plan['lineages'])}")
print(f"Heritages to create: {len(plan['heritages'])}")
print(f"Backgrounds to create: {len(plan['backgrounds'])}")

# Output the plan for review
print("\n--- LINEAGE FEATURE MAP ---")
for lid, uuids in plan["lineage_feature_map"].items():
    print(f"  {lid}: {uuids}")

print("\n--- HERITAGE FEATURE MAP ---")
for hid, uuids in plan["heritage_feature_map"].items():
    print(f"  {hid}: {uuids}")
