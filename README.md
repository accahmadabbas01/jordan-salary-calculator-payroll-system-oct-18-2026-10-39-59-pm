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
