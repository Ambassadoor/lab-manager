"""Chemical storage compatibility rules.

Advisory, not enforced at the DB level — see ContainerWriteSerializer's
`storage_warnings`/`validate()` for how a caller can proceed anyway. The
rules themselves:

1. Organics (storage category shorthand starting with "O") and Inorganics
   ("I") shouldn't share an immediate parent location.
2. Flammable and Oxidizing (GHS pictograms) chemicals shouldn't share an
   immediate parent location.
3. Nitric Acid must be stored separately from every other chemical.
4. Only chemicals of the same storage category (e.g. O2 with O2) should
   share an immediate parent location. A mix across the Organic/Inorganic
   divide is left to rule 1's more specific warning rather than repeated
   here.

"Immediate parent location" means Container.location directly — this does
not look at a location's ancestor/descendant chain, only what else has the
exact same `location` FK value.
"""

from collections import defaultdict

from natsort import natsorted

from .models import SDS, Container, GHSPictogram

NITRIC_ACID_CAS = "7697-37-2"


def _hazard_sets_by_chemical(chemical_ids):
    """Maps chemical_id -> every GHS pictogram ever documented for it,
    aggregated across every SDS attached to any of its containers (not
    just one container's own latest SDS) — mirrors the frontend's own
    "fall back to the chemical's other SDS" behavior
    (useContainerSdsFallback.ts), aggregating instead of picking just one.
    Safety-relevant, so erring toward "has this hazard ever been
    documented" rather than "does the single most recent SDS list it."

    One query for however many chemicals are being compared, rather than
    one per chemical.
    """
    result: dict[int, set[str]] = defaultdict(set)
    rows = SDS.objects.filter(container__chemical_id__in=chemical_ids).values_list(
        "container__chemical_id", "ghs_pictograms"
    )
    for chemical_id, pictograms in rows:
        result[chemical_id].update(pictograms)
    return result


def check_storage_conflicts(chemical, location, *, exclude_container_id=None, also_placing=()):
    """Returns a list of human-readable warnings for storing `chemical` in
    `location`, given what else is (or will be) stored there directly.
    Empty list means no conflicts.

    `exclude_container_id` excludes a container from the "already there"
    set — needed when checking a container being *moved within* the same
    location it's already in (re-saving the same location shouldn't warn
    about conflicting with itself).

    `also_placing`: other Chemical instances being placed into `location`
    in the same operation but not yet saved there — e.g. a bulk transfer's
    other containers, checked alongside whatever's already stored, so a
    batch that would only conflict with *itself* (nothing pre-existing in
    the destination) still gets caught instead of each container passing
    its own check in isolation.
    """
    existing = (
        Container.objects.filter(location=location)
        .exclude(pk=exclude_container_id)
        .select_related("chemical", "chemical__storage_category")
    )
    others = [c.chemical for c in existing] + list(also_placing)
    if not others:
        return []

    warnings = []

    # Rule 3: Nitric Acid stored separately from every *other* chemical —
    # explicitly not from itself, so several Nitric Acid containers sharing
    # a location (or a batch transfer moving more than one there together)
    # isn't a violation. Checked both directions: placing Nitric Acid
    # somewhere with anything else, or placing anything else somewhere
    # Nitric Acid already is.
    if chemical.cas == NITRIC_ACID_CAS:
        other_chemicals = {c.name for c in others if c.cas != NITRIC_ACID_CAS}
        if other_chemicals:
            warnings.append(
                "Nitric Acid must be stored separately from all other chemicals, but this "
                f"location already has: {', '.join(sorted(other_chemicals))}."
            )
    else:
        other_nitric_acid = any(c.cas == NITRIC_ACID_CAS for c in others)
        if other_nitric_acid:
            warnings.append(
                "This location already has Nitric Acid stored in it, which must be kept "
                "separate from all other chemicals."
            )

    # Rule 1: Organics ("O..." storage category) and Inorganics ("I...")
    # shouldn't share a location. No warning if this chemical's category
    # is unset/unknown, or isn't part of this organic/inorganic scheme.
    shorthand = chemical.storage_category.shorthand if chemical.storage_category else ""
    opposite_prefix = {"O": "I", "I": "O"}.get(shorthand[:1])
    if opposite_prefix:
        conflicting = {
            c.name
            for c in others
            if c.storage_category and c.storage_category.shorthand.startswith(opposite_prefix)
        }
        if conflicting:
            this_kind = "Organic" if opposite_prefix == "I" else "Inorganic"
            other_kind = "Inorganic" if opposite_prefix == "I" else "Organic"
            warnings.append(
                f"{this_kind} and {other_kind} chemicals should not be stored together — "
                f"this location already has {other_kind.lower()} chemical(s): "
                f"{', '.join(sorted(conflicting))}."
            )

    # Rule 4: only the same storage category shares a location. Compared by
    # shorthand rather than id (the code is what's on the shelf label).
    # Categories on the other side of the Organic/Inorganic divide are
    # skipped — rule 1 already warned about those, more specifically — as
    # are chemicals with no category set (unknown, not a mismatch).
    if shorthand:
        other_categories: dict[str, set[str]] = defaultdict(set)
        for c in others:
            other = c.storage_category.shorthand if c.storage_category else ""
            if other and other != shorthand and other[:1] == shorthand[:1]:
                other_categories[other].add(c.name)
        if other_categories:
            listed = "; ".join(
                f"{code}: {', '.join(sorted(names))}"
                # natsorted so O10 lists after O9, not after O1
                for code, names in natsorted(other_categories.items())
            )
            warnings.append(
                f"Only {shorthand} chemicals should be stored together here — this location "
                f"already has chemical(s) from other storage categories: {listed}."
            )

    # Rule 2: Flammable and Oxidizing GHS hazards shouldn't share a
    # location. A chemical documented as *both* (rare, but not
    # impossible) is skipped rather than warning against itself.
    chemical_ids = {chemical.id} | {c.id for c in others}
    hazards_by_chemical = _hazard_sets_by_chemical(chemical_ids)
    this_hazards = hazards_by_chemical.get(chemical.id, set())
    is_flammable = GHSPictogram.FLAMMABLE in this_hazards
    is_oxidizing = GHSPictogram.OXIDIZING in this_hazards
    if is_flammable != is_oxidizing:
        opposite_hazard = GHSPictogram.OXIDIZING if is_flammable else GHSPictogram.FLAMMABLE
        conflicting = {
            c.name for c in others if opposite_hazard in hazards_by_chemical.get(c.id, set())
        }
        if conflicting:
            this_label = "Flammable" if is_flammable else "Oxidizing"
            other_label = "Oxidizing" if is_flammable else "Flammable"
            warnings.append(
                f"{this_label} and {other_label} chemicals should not be stored together — "
                f"this location already has {other_label.lower()} chemical(s): "
                f"{', '.join(sorted(conflicting))}."
            )

    return warnings
