# Discord Confessions Bot

This bot lets members post confessions under an alias while still allowing admins to see who submitted each one.

## Features

- Anonymous confession posts shown under a user-provided alias
- Admin-only audit trail that records the real author
- Admin audit logging for anonymous thread replies too
- One-click thread replies for each confession
- Reply messages inside the thread include a fresh reply button so members can quickly post follow-ups
- Optional role ping on every new confession
- Optional per-member reply limit per confession (`MAX_REPLIES_PER_MEMBER_PER_CONFESSION`)
- Per-server configuration with slash commands
- Built-in web dashboard for config management and confession history

## Commands

- `/confess` opens a modal so someone can submit:
  - an alias
  - their confession
- `/confessions-config` updates:
  - the confession channel
  - the admin audit channel
  - the role to ping for each confession
  - clear toggles so any of those settings can be removed later
- `/confessions-status` shows the current setup for the server

## Setup

1. Create a Discord application and bot in the Discord developer portal.
2. Enable these bot permissions:
   - `Send Messages`
   - `Embed Links`
   - `Use Slash Commands`
   - `Create Public Threads`
   - `Send Messages in Threads`
   - `Manage Threads` (recommended)
3. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - optionally `GUILD_ID` for instant dev command registration
   - `DASHBOARD_PASSWORD` for the web dashboard login
   - optionally `DATA_DIR` if you want storage outside the project folder
   - optionally `DASHBOARD_PORT`
   - optionally `MAX_REPLIES_PER_MEMBER_PER_CONFESSION` (`0` or unset means unlimited replies per member)
4. Install packages:

```bash
npm install
```

5. Start the bot:

```bash
npm start
```

6. Open the dashboard at `http://localhost:3000` unless you changed `DASHBOARD_PORT`.

## Railway Deploy

Railway is a good fit for this project because it can run the Discord bot and the dashboard in one Node service.

1. Push this repo to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. Add a Volume and mount it at `/app/data`.
4. In Railway variables, set:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `DASHBOARD_PASSWORD`
   - `DATA_DIR=/app/data`
   - optionally `GUILD_ID`
   - optionally `DEFAULT_CONFESSION_CHANNEL_ID`
   - optionally `DEFAULT_AUDIT_CHANNEL_ID`
   - optionally `DEFAULT_PING_ROLE_ID`
5. Deploy. Railway will provide the `PORT` variable automatically, and the dashboard will use it.

Your confession data will then persist in the mounted Railway volume instead of disappearing on redeploy.

## Testing

Use this order so you can tell exactly what is working:

1. Run `npm run check`
   - This confirms the main source files parse correctly.
2. Run `npm start`
   - You should see logs that the bot logged in and slash commands registered.
   - If `DASHBOARD_PASSWORD` is set, you should also see the dashboard port message.
3. Open the dashboard
   - Visit `http://localhost:3000` locally, or your Railway service URL after deploy.
   - Log in with `DASHBOARD_PASSWORD`.
4. In Discord, run `/confessions-config`
   - Set the confession channel
   - Set the audit channel
   - Optionally set the ping role
5. In Discord, run `/confessions-status`
   - Confirm the IDs and channel mentions look correct.
6. Submit a confession with `/confess`
   - Confirm the public confession appears in the confession channel
   - Confirm the alias appears publicly
   - Confirm the configured role gets pinged if enabled
   - Confirm the real author appears only in the audit channel
7. Click `Reply in thread`
   - Submit an anonymous reply
   - Confirm a thread is created
   - Confirm the reply appears in the thread under the reply alias
   - Confirm the audit channel logs the real author of the reply
8. Refresh the dashboard
   - Confirm the confession appears in history
   - Confirm the author ID and links are visible there
9. Restart the app
   - Confirm the saved config and confession history are still present
   - On Railway, this verifies your volume is mounted correctly

If slash commands do not appear right away, set `GUILD_ID` for your test server and restart the app. Guild commands update much faster than global commands.

## One-Click Preview

If you just want to see the interface without installing anything yet, double-click `launch-preview.bat`. It opens the static mockup at `preview/dashboard-preview.html` in your browser.

## Inviting the Bot

Use the OAuth URL generator in the Discord developer portal and include the `bot` and `applications.commands` scopes.

## Notes

- The bot stores server config and confession metadata in `data/store.json`.
- The audit channel should be visible only to trusted moderators/admins.
- The dashboard shows author IDs and confession contents, so protect it with a strong password and keep it private.
- If a confession already has a reply thread, the reply button posts into the existing thread instead of creating a new one.
