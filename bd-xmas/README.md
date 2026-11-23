# Berberian-Downs Christmas 2026 gift tracker

Everyone's gift lists in one place. Claim a gift so nobody doubles up. The person a gift is for never sees claims or comments on their own items.

Stack: a static page (`public/`), one Vercel function (`api/index.js`), a Supabase Postgres database. All rules run on the server in `lib/handler.js`.

## Setup (about 30 minutes, one time)

### 1. Create the database (Supabase)

1. Open your Supabase project, then **SQL Editor → New query**.
2. Open `supabase/setup.sql` from this folder, copy everything, paste it in, and click **Run**. It should say "Success".
3. Open **Table Editor**. You should see `people` (6 rows) and `items` (27 rows) filled in from the Google Sheet.

### 2. Collect two values from Supabase

Do not paste these into chat, email or text. They go only into Vercel in step 4.

- **Project URL.** Project Settings → Data API (or "API"). It looks like `https://abcdefgh.supabase.co`.
- **Secret key.** Project Settings → API Keys. Copy the key that starts with `sb_secret_` (the "secret" key). On older projects this is the `service_role` key under "Legacy API keys". Never use the publishable or anon key here.

### 3. Put the code on GitHub

1. Unzip this project on your computer.
2. In your empty repo, click **Add file → Upload files**.
3. Drag in the *contents* of the folder: `api`, `lib`, `public`, `supabase`, `test`, `package.json`, `vercel.json`, `README.md`. Do not drag in the outer folder itself.
4. Click **Commit changes**.

### 4. Deploy (Vercel)

1. **Add New → Project**, then import your `bd-xmas` repo.
2. Framework Preset: **Other**. Leave Build Command and Output Directory as they are.
3. Open **Environment Variables** and add these three:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from step 2 |
   | `SUPABASE_SECRET_KEY` | the secret key from step 2 |
   | `SESSION_SECRET` | any long random string, 40+ characters (mash the keyboard, or use a password generator) |

4. Click **Deploy**. When it finishes you get an address like `bd-xmas.vercel.app`.

### 5. First run

1. Open the address on your phone.
2. Sign in as yourself first and pick your 4-digit PIN. The first person to sign in under a name sets that name's PIN, so do yours and Devin's before sharing the link.
3. Test: add an item, then sign out, sign in as Devin, and claim something on your list. Sign back in as yourself and confirm you can't see the claim.
4. Send the link to the family.

## Everyday admin

- **Someone forgot their PIN:** Supabase → Table Editor → `people` → clear that person's `pin_hash` cell and save. They pick a new PIN next time they sign in. If they are locked out, also clear `locked_until`.
- **Add a person:** they can add themselves from the sign-in screen ("Add a person").
- **Back up:** Table Editor → each table → Export → CSV.
- **See the data:** Table Editor. Note that this includes claims on your own list. Honor code.
- **Supabase free tier:** projects pause after a week with no activity. If the site ever shows an error, open the project in Supabase and click Restore.

## Check the code locally (optional)

`node test/test.js` runs the real page and the real server code against an in-memory database and checks the hiding rules, claim limits, PIN lockout and permissions. It needs only Node 18 or newer.

## What each file does

- `public/index.html`: the whole interface.
- `api/index.js`: the one server endpoint, `/api`.
- `lib/handler.js`: every rule (who can see, claim, comment, edit).
- `lib/auth.js`: signed session cookies and PIN hashing.
- `lib/db.js`: the Supabase queries.
- `supabase/setup.sql`: tables, lock-down rules, and the imported lists.
