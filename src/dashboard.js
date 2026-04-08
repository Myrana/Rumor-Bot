const crypto = require("node:crypto");
const path = require("node:path");

const express = require("express");

const { listConfessions, listGuildConfigs, upsertGuildConfig } = require("./store");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cookieValue(rawCookie, name) {
  if (!rawCookie) {
    return null;
  }

  const pairs = rawCookie.split(";").map((part) => part.trim());
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=");
    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}

function buildSessionValue(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function isAuthenticated(request, expectedSessionValue) {
  return cookieValue(request.headers.cookie, "dashboard_session") === expectedSessionValue;
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function guildLabel(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  return guild ? `${guild.name} (${guildId})` : guildId;
}

function layout({ title, body, flashMessage = "" }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/dashboard.css" />
  </head>
  <body>
    <div class="page-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Discord Confessions</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
      </header>
      ${flashMessage ? `<div class="flash">${escapeHtml(flashMessage)}</div>` : ""}
      ${body}
    </div>
  </body>
</html>`;
}

function loginPage(errorMessage = "") {
  return layout({
    title: "Dashboard Login",
    flashMessage: errorMessage,
    body: `<main class="login-card">
      <p class="muted">Enter the dashboard password from your <code>.env</code> file.</p>
      <form method="post" action="/login" class="stack">
        <label>
          <span>Password</span>
          <input type="password" name="password" required />
        </label>
        <button type="submit">Open dashboard</button>
      </form>
    </main>`
  });
}

function dashboardPage({ client, flashMessage = "" }) {
  const guildCards = listGuildConfigs()
    .sort((left, right) => left.guildId.localeCompare(right.guildId))
    .map((config) => {
      const label = guildLabel(client, config.guildId);

      return `<section class="card">
        <div class="card-header">
          <div>
            <h2>${escapeHtml(label)}</h2>
            <p class="muted">Edit the channels and optional ping role for this server.</p>
          </div>
        </div>
        <form method="post" action="/guilds/${encodeURIComponent(config.guildId)}" class="grid-form">
          <label>
            <span>Confession channel ID</span>
            <input type="text" name="confessionChannelId" value="${escapeHtml(config.confessionChannelId || "")}" />
          </label>
          <label>
            <span>Audit channel ID</span>
            <input type="text" name="auditChannelId" value="${escapeHtml(config.auditChannelId || "")}" />
          </label>
          <label>
            <span>Ping role ID</span>
            <input type="text" name="pingRoleId" value="${escapeHtml(config.pingRoleId || "")}" />
          </label>
          <button type="submit">Save server config</button>
        </form>
      </section>`;
    })
    .join("");

  const confessionsTable = listConfessions()
    .map((confession) => {
      const guildName = guildLabel(client, confession.guildId);
      const messageUrl = `https://discord.com/channels/${confession.guildId}/${confession.channelId}/${confession.messageId}`;
      const threadUrl = confession.threadId
        ? `https://discord.com/channels/${confession.guildId}/${confession.threadId}/${confession.threadId}`
        : "";

      return `<tr>
        <td>${escapeHtml(guildName)}</td>
        <td>${escapeHtml(confession.alias)}</td>
        <td class="body-cell">${escapeHtml(confession.body)}</td>
        <td>${escapeHtml(confession.authorId)}</td>
        <td>${formatDate(confession.createdAt)}</td>
        <td>
          <a href="${escapeHtml(messageUrl)}" target="_blank" rel="noreferrer">Post</a>
          ${threadUrl ? ` <a href="${escapeHtml(threadUrl)}" target="_blank" rel="noreferrer">Thread</a>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  const body = `<main class="stack-xl">
    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">Configured servers</span>
        <strong>${listGuildConfigs().length}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">Stored confessions</span>
        <strong>${listConfessions().length}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">Connected guilds</span>
        <strong>${client.guilds.cache.size}</strong>
      </article>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Add or update a server</h2>
          <p class="muted">Use this when a guild is not already listed below.</p>
        </div>
      </div>
      <form method="post" action="/guilds" class="grid-form">
        <label>
          <span>Guild ID</span>
          <input type="text" name="guildId" required />
        </label>
        <label>
          <span>Confession channel ID</span>
          <input type="text" name="confessionChannelId" />
        </label>
        <label>
          <span>Audit channel ID</span>
          <input type="text" name="auditChannelId" />
        </label>
        <label>
          <span>Ping role ID</span>
          <input type="text" name="pingRoleId" />
        </label>
        <button type="submit">Save server config</button>
      </form>
    </section>

    <section class="stack">
      <div class="section-heading">
        <h2>Server configuration</h2>
      </div>
      ${guildCards || '<section class="card"><p class="muted">No server-specific config has been saved yet.</p></section>'}
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Confession history</h2>
          <p class="muted">This includes author IDs, so keep the dashboard restricted.</p>
        </div>
        <form method="post" action="/logout">
          <button class="secondary" type="submit">Log out</button>
        </form>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Guild</th>
              <th>Alias</th>
              <th>Confession</th>
              <th>Author ID</th>
              <th>Created</th>
              <th>Links</th>
            </tr>
          </thead>
          <tbody>
            ${confessionsTable || '<tr><td colspan="6" class="muted">No confessions have been stored yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  </main>`;

  return layout({
    title: "Dashboard",
    body,
    flashMessage
  });
}

function normalizeField(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function startDashboard({ client }) {
  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  if (!dashboardPassword) {
    console.warn("Dashboard disabled because DASHBOARD_PASSWORD is not set.");
    return null;
  }

  const app = express();
  const sessionValue = buildSessionValue(dashboardPassword);
  const port = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3000);

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(process.cwd(), "src", "public")));

  app.get("/login", (request, response) => {
    if (isAuthenticated(request, sessionValue)) {
      response.redirect("/");
      return;
    }

    response.send(loginPage());
  });

  app.post("/login", (request, response) => {
    if (request.body.password !== dashboardPassword) {
      response.status(401).send(loginPage("That password did not match."));
      return;
    }

    response.setHeader("Set-Cookie", `dashboard_session=${sessionValue}; HttpOnly; SameSite=Strict; Path=/`);
    response.redirect("/");
  });

  app.use((request, response, next) => {
    if (request.path === "/login" || request.path === "/dashboard.css") {
      next();
      return;
    }

    if (!isAuthenticated(request, sessionValue)) {
      response.redirect("/login");
      return;
    }

    next();
  });

  app.get("/", (_request, response) => {
    response.send(dashboardPage({ client }));
  });

  app.post("/guilds", (request, response) => {
    const guildId = normalizeField(request.body.guildId);

    if (!guildId) {
      response.status(400).send(dashboardPage({ client, flashMessage: "Guild ID is required." }));
      return;
    }

    upsertGuildConfig(guildId, {
      confessionChannelId: normalizeField(request.body.confessionChannelId),
      auditChannelId: normalizeField(request.body.auditChannelId),
      pingRoleId: normalizeField(request.body.pingRoleId)
    });

    response.send(dashboardPage({ client, flashMessage: `Saved config for guild ${guildId}.` }));
  });

  app.post("/guilds/:guildId", (request, response) => {
    const guildId = normalizeField(request.params.guildId);

    if (!guildId) {
      response.status(400).send(dashboardPage({ client, flashMessage: "Guild ID is required." }));
      return;
    }

    upsertGuildConfig(guildId, {
      confessionChannelId: normalizeField(request.body.confessionChannelId),
      auditChannelId: normalizeField(request.body.auditChannelId),
      pingRoleId: normalizeField(request.body.pingRoleId)
    });

    response.send(dashboardPage({ client, flashMessage: `Updated config for guild ${guildId}.` }));
  });

  app.post("/logout", (_request, response) => {
    response.setHeader("Set-Cookie", "dashboard_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    response.redirect("/login");
  });

  return app.listen(port, () => {
    console.log(`Dashboard available on port ${port}`);
  });
}

module.exports = {
  startDashboard
};
