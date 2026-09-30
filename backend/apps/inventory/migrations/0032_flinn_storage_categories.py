from django.db import migrations

# Flinn Scientific storage pattern, transcribed from
# docs/Flinn Scientific Chemical Storage Pattern.md. Copied here rather than
# imported so this migration keeps working however app code changes later.
#
# code -> (description: the chart's "Chemical Types", families: the chart's
# family index entries for that code, minus their organic/inorganic
# qualifiers — the code's group already says which).
#
# The miscellaneous categories keep this app's existing codes, O10 and I11
# (Flinn's OM and IM), so already-printed labels stay correct.
FLINN_CATEGORIES = {
    "O1": ("Acids, Amino Acids, Anhydrides, Peracids", ["Acids", "Amino Acids", "Anhydrides", "Peracids"]),
    "O2": (
        "Alcohols, Glycols, Sugars, Amines, Amides, Imines, Imides",
        ["Alcohols", "Amides", "Amines", "Glycols", "Imides", "Imines", "Sugars"],
    ),
    "O3": (
        "Hydrocarbons, Esters, Aldehydes, Oils",
        ["Aldehydes", "Esters", "Hydrocarbons", "Oils"],
    ),
    "O4": (
        "Ethers, Ketones, Ketenes, Halogenated Hydrocarbons, Ethylene Oxide",
        ["Ethers", "Ethylene Oxide", "Halogenated Hydrocarbons", "Ketenes", "Ketones"],
    ),
    "O5": ("Epoxy Compounds, Isocyanates", ["Epoxy Compounds", "Isocyanates"]),
    "O6": ("Peroxides, Hydroperoxides, Azides", ["Azides", "Hydroperoxides", "Peroxides"]),
    "O7": (
        "Sulfides, Polysulfides, Sulfoxides, Nitriles",
        ["Nitriles", "Polysulfides", "Sulfides", "Sulfoxides"],
    ),
    "O8": ("Phenols, Cresols", ["Cresols", "Phenols"]),
    "O9": ("Dyes, Stains, Indicators", ["Dyes", "Indicators", "Stains"]),
    "O10": ("Organic Miscellaneous", []),
    "I1": ("Metals, Hydrides", ["Hydrides", "Metals"]),
    "I2": (
        "Acetates, Halides, Iodides, Sulfates, Sulfites, Thiosulfates, Phosphates, Halogens",
        [
            "Acetates",
            "Halides",
            "Halogens",
            "Iodides",
            "Phosphates",
            "Sulfates",
            "Sulfites",
            "Thiosulfates",
        ],
    ),
    "I3": (
        "Amides, Nitrates (except Ammonium Nitrate, store as I8), Nitrites, Azides",
        ["Amides", "Azides", "Nitrates", "Nitrites"],
    ),
    "I4": (
        "Hydroxides, Oxides, Silicates, Carbonates, Carbon",
        ["Carbon", "Carbonates", "Hydroxides", "Oxides", "Silicates"],
    ),
    "I5": (
        "Sulfides, Selenides, Phosphides, Carbides, Nitrides",
        ["Carbides", "Nitrides", "Phosphides", "Selenides", "Sulfides"],
    ),
    "I6": (
        "Chlorates, Bromates, Iodates, Chlorites, Hypochlorites, Perchlorates, Perchloric Acid, "
        "Peroxides, Hydrogen Peroxide",
        [
            "Bromates",
            "Chlorates",
            "Chlorites",
            "Hydrogen Peroxide",
            "Hypochlorites",
            "Iodates",
            "Perchlorates",
            "Perchloric Acid",
            "Peroxides",
        ],
    ),
    "I7": ("Arsenates, Cyanides, Cyanates", ["Arsenates", "Cyanates", "Cyanides"]),
    "I8": (
        "Borates, Chromates, Manganates, Permanganates",
        # Ammonium Nitrate is the chart's I3 exception — listed here so a
        # search for it lands on the right code
        ["Ammonium Nitrate", "Borates", "Chromates", "Manganates", "Permanganates"],
    ),
    # Nitric Acid is still an I9 acid — it just gets its own isolated spot
    # rather than sharing the I9 shelf (the chart's "except Nitric" means
    # that, not a different category)
    "I9": (
        "Acids — Nitric Acid is isolated and stored by itself",
        ["Acids", "Nitric Acid"],
    ),
    "I10": (
        "Sulfur, Phosphorus, Arsenic, Phosphorous Pentoxide",
        ["Arsenic", "Phosphorous Pentoxide", "Phosphorus", "Sulfur"],
    ),
    "I11": ("Inorganic Miscellaneous", []),
}


def apply_flinn_categories(apps, schema_editor):
    """Update each category's description/families by shorthand, creating
    any that are missing (e.g. a fresh dev database). help_text — the
    lab's own identification hints — is left as it is.
    """
    Category = apps.get_model("inventory", "ChemicalStorageCategories")
    for code, (description, families) in FLINN_CATEGORIES.items():
        rows = Category.objects.filter(shorthand=code)
        if rows.exists():
            rows.update(description=description, families=families)
        else:
            Category.objects.create(
                shorthand=code, description=description, families=families, help_text=""
            )


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0031_storage_category_families"),
    ]

    operations = [
        # Reverse is a no-op: the previous (truncated) descriptions aren't
        # worth restoring, and 0031's reverse drops `families` anyway
        migrations.RunPython(apply_flinn_categories, migrations.RunPython.noop),
    ]
