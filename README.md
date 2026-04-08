# Discord Confessions Bot

This bot lets members post confessions under an alias while still allowing admins to see who submitted each one.

## Features

- Anonymous confession posts shown under a user-provided alias
- Admin-only audit trail that records the real author
- Admin audit logging for anonymous thread replies too
- One-click thread replies for each confession
- Optional role ping on every new confession
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
   - optionally `DASHBOARD_PORT`
4. Install packages:

```bash
npm install
```

5. Start the bot:

```bash
npm start
```

6. Open the dashboard at `http://localhost:3000` unless you changed `DASHBOARD_PORT`.

## One-Click Preview

If you just want to see the interface without installing anything yet, double-click `launch-preview.bat`. It opens the static mockup at `preview/dashboard-preview.html` in your browser.

## Inviting the Bot

Use the OAuth URL generator in the Discord developer portal and include the `bot` and `applications.commands` scopes.

## Notes

- The bot stores server config and confession metadata in `data/store.json`.
- The audit channel should be visible only to trusted moderators/admins.
- The dashboard shows author IDs and confession contents, so protect it with a strong password and keep it private.
- If a confession already has a reply thread, the reply button posts into the existing thread instead of creating a new one.
