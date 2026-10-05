# User manuals

Three role-specific manuals for the Fshikta Dental clinic system.

| Source | Audience |
|---|---|
| `01-Receptionist-Manual.md` | Front desk |
| `02-Doctors-and-Nurses-Manual.md` | Dentists, dental officers, nurses |
| `03-Manager-and-Accountants-Manual.md` | Owner, general manager, accountants, stores |

Screenshots live in `images/`. Built HTML, PDF and DOCX land in `build/` (not for hand-editing).

## Rebuilding the documents

```bash
pip install python-docx markdown
python docs/manuals/build-manuals.py
```

PDF uses whichever of Chrome or Edge is installed; no pandoc or LaTeX needed. Screenshots that have
not been captured yet show as a red placeholder in the output, so gaps are visible rather than silent.

## Recapturing screenshots

Needs the app running and the demo logins to exist.

```bash
# 1. backend and frontend
cd backend  && npm run start:dev
cd frontend && npm run dev

# 2. demo logins (idempotent — re-running just resets the passwords)
cd backend && DATABASE_URL="<from backend/.env>" node ../docs/manuals/create-demo-users.js

# 3. screenshots
npm i -g playwright && npx playwright install chromium   # once
node docs/manuals/capture-screenshots.mjs                # or --only reception|clinical|management
```

Demo accounts, password `Demo@1234`:

| Email | Role |
|---|---|
| demo.reception@fshikta.local | RECEPTIONIST |
| demo.dentist@fshikta.local | DENTIST |
| demo.nurse@fshikta.local | NURSE |
| demo.manager@fshikta.local | ADMIN |

These are for screenshots and training only. Do not create them on a production database.

## Editing

Edit the Markdown, not the generated files. Each screenshot is referenced as
`![Figure n — caption](images/<name>.png)`; the figure caption in the Markdown becomes the caption
in the PDF and DOCX. To add a screen, add an entry to the `SHOTS` list in
`capture-screenshots.mjs` and reference the new image from the Markdown.
