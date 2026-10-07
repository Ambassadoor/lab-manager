# Documentation

Project planning and reference documents live here, so they travel with the code.

| Document | What it is | Kept current? |
|----------|------------|---------------|
| [Lab-Manager-App-Project-Plan.md](Lab-Manager-App-Project-Plan.md) | The original plan: scope, milestones, architecture, data model. "As built" notes mark where the build differs | Milestone status and as-built notes, yes |
| [Roles_and_Permissions.md](Roles_and_Permissions.md) | What each role can do, as the code enforces it | Yes. Update it with any permission change |
| [Post-MVP-Code-Review.md](Post-MVP-Code-Review.md) | Review of everything added since MVP sign-off: how each part works, known problems, and how it compares with professional practice | A snapshot of 1 October 2026; only the status notes change |
| [Lab Manager on a Raspberry Pi — Deployment Plan.md](Lab%20Manager%20on%20a%20Raspberry%20Pi%20—%20Deployment%20Plan.md) | How the live app was deployed to the Pi, with as-built notes | A record of the deployment |
| [Bug-Reporting-Plan.md](Bug-Reporting-Plan.md) | Design of the in-app bug reports and the GitHub App setup | Phases marked done as built |
| [Barcode-Scanner.md](Barcode-Scanner.md) | Setting up the barcode scanner (backtick prefix, pairing, iPad) and how the app recognises scans | Yes |
| [Flinn Scientific Chemical Storage Pattern.md](Flinn%20Scientific%20Chemical%20Storage%20Pattern.md) | The storage category chart the app's categories are loaded from | Reference |

Elsewhere in the repository:

| Document | What it is |
|----------|------------|
| [../README.md](../README.md) | Setup for all three services |
| [../CLAUDE.md](../CLAUDE.md) | The shortest accurate description of how the system works today. Written for an LLM, useful for a person |
| [../backend/README.md](../backend/README.md) | API routes, management commands, scripts |
| [../frontend/README.md](../frontend/README.md) | Frontend structure and environment variables |
| [../bridge/README.md](../bridge/README.md) | Balance and printer setup |
| [../bridge/PRINTER_PLAN.md](../bridge/PRINTER_PLAN.md) | Printer protocol notes and the history of how it was worked out |
| [../deploy/pi/README.md](../deploy/pi/README.md) | Installed service files, deploying updates, rolling back |
