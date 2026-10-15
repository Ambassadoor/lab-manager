# Improvements backlog

Changes noticed while walking through the code after v1.4.0. Planned work goes first, in
priority order; ideas that need decisions before they're actionable go last. Remove an item when
its PR merges. Nothing is planned at the moment.

## Ideas (not actionable yet)

### Camera: smaller preview

- Replace the full-screen dialog with a docked panel, so the Actions list stays visible as scans
  are added.
- It would need to be non-modal for the list to stay usable.
- It might need to decode only the aiming area, so codes outside the visible preview aren't read.
- Keep full screen for single scans.

### Container QR codes as URLs

- Labels would encode a URL (e.g. `https://app.cplabmanager.com/c/CHEM-0292`) in place of
  `{"id":"CHEM-0292"}`, so a phone's own camera opens the container's SDS.
- **What it involves:**
  - A public `/c/:label` page that finds the container's SDS through the existing public
    `GET /api/inventory/sds/?container=<id>`, or says "No SDS on file". Don't point at
    `/sds/:id`, which changes when a container's SDS is replaced.
  - `identify()` accepts the URL as well as the JSON and bare ids, so old labels keep working.
  - The print payload changes. Test-print on the narrowest tape, since a longer payload makes a
    denser QR code.
  - Check In offers to print a new label when it sees the old format.
- **Decisions needed:**
  - **Reach:** the domain resolves to a private campus IP, so phones off campus or on cellular
    data can't open it.
  - **Location labels:** whether they change too.

### Microsoft sign-in and a My Apps tile

- The university uses Microsoft Entra ID; its My Apps portal is where the tile would appear.
- **A bookmark tile** is only a link, and almost no work for IT.
- **An SSO app** has three parts:
  - IT registers the app in the university's Entra tenant (OIDC) and assigns which users or
    groups can see it.
  - Django adds Microsoft login (e.g. django-allauth's Microsoft provider).
  - Open registration goes away; a local admin login stays as a fallback.
- **Ask IT** whether the sign-in token can include the Lipscomb ID. If it can, `User.lipscomb_id`
  fills itself in, and Check Out's holder lookup matches more people.
- A tile doesn't change who can reach the app: it's still campus only.
