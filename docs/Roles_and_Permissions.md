# Roles and Permissions

What each role can do, as the code enforces it today. The server is the authority: `role_at_least()` in [backend/apps/users/permissions.py](../backend/apps/users/permissions.py) and each view's `get_permissions()`. The frontend hides pages and buttons using a copy of the same rank table ([roles.ts](../frontend/src/components/shared/roles.ts)), for convenience only.

When a view's permissions change, update this file in the same commit.

## Roles

A role has a rank, and a permission asks for a minimum rank. A higher rank can do everything a lower one can.

| Rank | Roles | Notes |
|------|-------|-------|
| 4 | Admin, Lab Manager | The same permissions. Kept as two values so IT could hold Admin while a non-technical person is Lab Manager. |
| 3 | Coordinator, Faculty | The same permissions. Nothing currently requires rank 3, so in practice these match Stockroom. |
| 2 | Stockroom Worker | Day-to-day inventory work. |
| 1 | Lab Assistant | Read-only. The default for a new account. |

Anyone not logged in is a **visitor**.

### Getting an account

Anyone with an `@lipscomb.edu` or `@mail.lipscomb.edu` address can register. The address is checked for its domain only; no confirmation email is sent. A new account is a Lab Assistant. A Lab Manager raises the role on the Users page.

## Permission matrix

"Any user" means any logged-in account, Lab Assistant included.

### Inventory

| Resource | Read | Create / edit | Delete |
|----------|------|---------------|--------|
| Chemicals | Any user | Stockroom | Lab Manager |
| Storage categories | Any user | Stockroom | Lab Manager |
| Containers | Any user | Stockroom | Lab Manager |
| Container actions: check out, check in, weigh in, transfer | — | Stockroom | — |
| Weight readings | Any user | Stockroom | Lab Manager |
| Locations | Any user | Create, add child, move: Stockroom. **Edit (rename, re-parent): any user** | Stockroom |
| Location types | Any user | Stockroom | Lab Manager |
| SDS | **Visitor** | Stockroom (create only; an SDS cannot be edited) | Not possible |
| Label templates | Any user | Lab Manager | Lab Manager |
| Dashboard | Any user | — | — |

Deleting a location is open to Stockroom because the database refuses to delete one that still has children or containers.

### Accounts

| Action | Who |
|--------|-----|
| Register, log in | Visitor |
| View and edit own profile (not own role) | Any user |
| List, view and edit other users; change a role | Lab Manager |
| Delete or deactivate a user | Not possible in the app (Django admin only) |

### Bug reports and feedback

| Action | Who |
|--------|-----|
| Submit a bug report or feedback | Visitor (rate-limited: 5 an hour anonymous, 30 an hour logged in) |
| List and view reports; triage feedback and promote it to a GitHub issue | Lab Manager |

A bug report from a logged-in user is sent to GitHub straight away. One from a visitor is saved but not sent until a Lab Manager promotes it, because the repository is public.

### Hardware bridge

The bridge (balance read and tare, label print, printer status) has **no login of its own**. The app shows print and weigh controls to Stockroom and up, but anyone who can reach the Pi on the network can call the bridge directly.

## Known gaps

These are open findings in the [Post-MVP Code Review](Post-MVP-Code-Review.md), listed here so the matrix above is not read as the intended design.

- **Location edit is not role-gated** (finding 8). A Lab Assistant can rename or re-parent a location through the API.
- **The bridge is unauthenticated** (finding 6).
- **Weight readings and checkout events can be edited** although they are meant to be append-only (finding 10).
- **Email addresses are not verified** at registration.
- **Login is not rate-limited.**
- Nothing stops the last Lab Manager demoting themselves.

## Not built

The original notes for this document described a different model. None of the following exists in the code:

- **Guest accounts and elevation requests.** The idea was that a new account starts as a guest and files a request for staff access, which a Lab Manager approves. `User.user_type` has a `guest` value, but nothing sets or checks it. Today a Lab Manager simply changes the role.
- **A Coordinator tier with wider rights than Stockroom** (creating chemicals, containers and SDS, with Stockroom limited to moving containers and recording weights). Stockroom does all of that today.
- **Student Worker** as a role. The read-only tier is Lab Assistant.
- **SDS update and delete.** An SDS is replaced by attaching a newer one.
