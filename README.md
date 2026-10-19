<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1c419d92-ba72-4d34-a5f4-b127be64cf6d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy on Vercel (with cloud save)

Data is kept in the browser and mirrored automatically to a cloud database, so it survives
redeploys and can be opened from any device.

1. Import the project in Vercel (framework: Vite, build `npm run build`, output `dist`).
2. In the project's **Storage** tab, add **Upstash Redis** (free plan is enough) and connect it to the
   project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. In **Settings → Environment Variables**, add `SYNC_KEY` with a long random secret.
4. Redeploy.
5. Open the app, click the cloud pill (top right, or bottom right on the sign-in screen), enter the
   same `SYNC_KEY`, and press **Connect**. Do this once on each device/browser.

The pill shows "Saved to cloud" once changes have uploaded. If two devices edit at the same time, the
second one shows "Cloud conflict" and asks which copy to keep — nothing is overwritten silently.

Running `npm run dev` locally needs no setup: the API keeps the cloud copy in memory until the dev
server stops.

## Excel import / export

Every screen has an **Excel** button above the content. Download the template (or export the current
data), edit it in Excel, and import it back. Employees, loans, salaries, monthly inputs, salary history
and the full workbook can be imported; clearances, users and the activity log are export-only.

## Working as a team

- **Comments** — the chat icon on employees, salary entries, payroll runs, clearances and maternity leaves
  opens a thread. Type `@` to mention a teammate (their app username), reply, and resolve when done.
- **Team Notes** (sidebar, and the "Team notes" button at the top) lists every thread in the company, with
  filters for open items and mentions. The badge counts new comments that mention you or reply to you.
- **Sync** — everyone uses the same Vercel URL and sync key. The app checks for teammates' changes every
  45 seconds and when you return to the tab. If two people change different records at the same time,
  both changes are kept automatically; you are only asked to choose when the *same* record was changed
  differently by two people.

## Testing the whole system

Company Settings → **Backup & Excel Data Transfer** → **Full system test**:

1. **Load test company** — adds "Full System Test Co." with 10 employees that cover every payroll rule,
   12 months of payroll, a completed clearance, two maternity leaves, October inputs and sample comments.
   Loading again resets only this company.
2. **Sample email (.eml)** and **Sample Excel (Arabic)** — files to try in Smart Import (Payroll Run).
3. Follow the **Test checklist** shown in the same card.
