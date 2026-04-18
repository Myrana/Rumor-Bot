require("dotenv").config();

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const {
  dataDir,
  getConfession,
  getGuildConfig,
  listRepliesForConfession,
  saveConfession,
  saveReply,
  storePath,
  updateConfession,
  upsertGuildConfig
} = require("./store");
const { startDashboard } = require("./dashboard");

const REQUIRED_ENV = ["DISCORD_TOKEN", "CLIENT_ID"];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Submit a confession under an alias."),
  new SlashCommandBuilder()
    .setName("confessions-config")
    .setDescription("Configure confession channels and the optional ping role.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("confession_channel")
        .setDescription("Where anonymous confessions should be posted.")
        .addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption((option) =>
      option
        .setName("audit_channel")
        .setDescription("Private staff channel where the real author is logged.")
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption((option) =>
      option
        .setName("ping_role")
        .setDescription("Optional role to ping for every new confession.")
    )
    .addBooleanOption((option) =>
      option
        .setName("clear_confession_channel")
        .setDescription("Clear the configured confession channel.")
    )
    .addBooleanOption((option) =>
      option
        .setName("clear_audit_channel")
        .setDescription("Clear the configured audit channel.")
    )
    .addBooleanOption((option) =>
      option
        .setName("clear_ping_role")
        .setDescription("Disable the automatic role ping.")
    ),
  new SlashCommandBuilder()
    .setName("confessions-status")
    .setDescription("Show the current confession configuration for this server.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
].map((command) => command.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function getEffectiveGuildConfig(guildId) {
  const stored = getGuildConfig(guildId);

  return {
    confessionChannelId: stored.confessionChannelId || process.env.DEFAULT_CONFESSION_CHANNEL_ID || null,
    auditChannelId: stored.auditChannelId || process.env.DEFAULT_AUDIT_CHANNEL_ID || null,
    pingRoleId: stored.pingRoleId || process.env.DEFAULT_PING_ROLE_ID || null
  };
}

function discordMessageUrl(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function confessionButtonRow({ guildId, messageId, threadId = null }) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reply:${messageId}`)
      .setLabel("Reply in thread")
      .setStyle(ButtonStyle.Primary)
  );

  if (threadId) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Open thread")
        .setStyle(ButtonStyle.Link)
        .setURL(discordMessageUrl(guildId, threadId, threadId))
    );
  }

  return row;
}

function threadReplyButtonRow(confessionMessageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reply:${confessionMessageId}`)
      .setLabel("Reply to this confession")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildConfessionEmbed({ alias, body, authorTag }) {
  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("New Confession")
    .addFields(
      { name: "Alias", value: alias },
      { name: "Confession", value: body }
    )
    .setTimestamp();

  if (authorTag) {
    embed.setFooter({ text: `Submitted by ${authorTag}` });
  }

  return embed;
}

function buildAuditEmbed({ alias, body, user, confessionMessageId, confessionChannelId }) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Confession Author Log")
    .addFields(
      { name: "User", value: `${user.tag} (${user.id})` },
      { name: "Alias", value: alias },
      { name: "Confession", value: body },
      {
        name: "Posted Message",
        value: discordMessageUrl(user.guild.id, confessionChannelId, confessionMessageId)
      }
    )
    .setTimestamp();
}

function buildReplyAuditEmbed({
  confessionAlias,
  replyAlias,
  replyBody,
  user,
  threadId,
  confessionMessageId,
  confessionChannelId
}) {
  return new EmbedBuilder()
    .setColor(0xffd866)
    .setTitle("Anonymous Reply Author Log")
    .addFields(
      { name: "User", value: `${user.tag} (${user.id})` },
      { name: "Confession Alias", value: confessionAlias },
      { name: "Reply Alias", value: replyAlias },
      { name: "Reply", value: replyBody },
      {
        name: "Confession",
        value: discordMessageUrl(user.guild.id, confessionChannelId, confessionMessageId)
      },
      {
        name: "Thread",
        value: discordMessageUrl(user.guild.id, threadId, threadId)
      }
    )
    .setTimestamp();
}

async function trySendAuditLog(channel, payload, contextLabel) {
  try {
    await channel.send(payload);
    return true;
  } catch (error) {
    console.error(`Failed to send ${contextLabel} audit log:`, error);
    return false;
  }
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  if (process.env.GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    return;
  }

  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
}

async function createReplyThread(confessionMessage, confessionRecord) {
  if (confessionRecord.threadId) {
    const existingThread = await confessionMessage.guild.channels.fetch(confessionRecord.threadId).catch(() => null);
    if (existingThread) {
      return existingThread;
    }
  }

  const thread = await confessionMessage.startThread({
    name: `Replies to ${confessionRecord.alias}`,
    autoArchiveDuration: 1440,
    reason: `Reply thread for confession by alias ${confessionRecord.alias}`
  });

  await thread.send({
    content: "Use the button below to post an anonymous reply in this thread.",
    components: [threadReplyButtonRow(confessionRecord.messageId)]
  }).catch(() => null);

  updateConfession(confessionRecord.messageId, { threadId: thread.id });
  await confessionMessage.edit({
    components: [
      confessionButtonRow({
        guildId: confessionMessage.guild.id,
        messageId: confessionRecord.messageId,
        threadId: thread.id
      })
    ]
  }).catch(() => null);
  return thread;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Using data directory: ${dataDir}`);
  console.log(`Using store file: ${storePath}`);

  try {
    await registerCommands();
    console.log("Slash commands registered.");
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }

  startDashboard({ client: readyClient });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guild) {
        await interaction.reply({
          content: "This bot can only be used inside a server.",
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === "confess") {
        const modal = new ModalBuilder()
          .setCustomId("confess-modal")
          .setTitle("Submit a confession");

        const aliasInput = new TextInputBuilder()
          .setCustomId("alias")
          .setLabel("Alias")
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(32)
          .setPlaceholder("Example: hallway-ghost")
          .setRequired(true);

        const confessionInput = new TextInputBuilder()
          .setCustomId("confession")
          .setLabel("Confession")
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(5)
          .setMaxLength(1500)
          .setPlaceholder("Write what you want to confess...")
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(aliasInput),
          new ActionRowBuilder().addComponents(confessionInput)
        );

        await interaction.showModal(modal);
        return;
      }

      if (interaction.commandName === "confessions-config") {
        const existing = getEffectiveGuildConfig(interaction.guild.id);
        const clearConfessionChannel = interaction.options.getBoolean("clear_confession_channel") || false;
        const clearAuditChannel = interaction.options.getBoolean("clear_audit_channel") || false;
        const clearPingRole = interaction.options.getBoolean("clear_ping_role") || false;

        const nextConfig = upsertGuildConfig(interaction.guild.id, {
          confessionChannelId: clearConfessionChannel
            ? null
            : interaction.options.getChannel("confession_channel")?.id || existing.confessionChannelId || null,
          auditChannelId: clearAuditChannel
            ? null
            : interaction.options.getChannel("audit_channel")?.id || existing.auditChannelId || null,
          pingRoleId: clearPingRole
            ? null
            : interaction.options.getRole("ping_role")?.id || existing.pingRoleId || null
        });

        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("Confessions Config Updated")
          .addFields(
            {
              name: "Confession Channel",
              value: nextConfig.confessionChannelId ? `<#${nextConfig.confessionChannelId}>` : "Not set"
            },
            {
              name: "Audit Channel",
              value: nextConfig.auditChannelId ? `<#${nextConfig.auditChannelId}>` : "Not set"
            },
            {
              name: "Ping Role",
              value: nextConfig.pingRoleId ? `<@&${nextConfig.pingRoleId}>` : "Disabled"
            }
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (interaction.commandName === "confessions-status") {
        const config = getEffectiveGuildConfig(interaction.guild.id);

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("Confessions Status")
          .addFields(
            {
              name: "Confession Channel",
              value: config.confessionChannelId ? `<#${config.confessionChannelId}>` : "Not set"
            },
            {
              name: "Audit Channel",
              value: config.auditChannelId ? `<#${config.auditChannelId}>` : "Not set"
            },
            {
              name: "Ping Role",
              value: config.pingRoleId ? `<@&${config.pingRoleId}>` : "Disabled"
            }
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "confess-modal") {
      if (!interaction.guild) {
        await interaction.reply({ content: "This bot can only be used inside a server.", ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const config = getEffectiveGuildConfig(interaction.guild.id);

      if (!config.confessionChannelId || !config.auditChannelId) {
        await interaction.editReply({
          content: "This server is not configured yet. Ask an admin to run `/confessions-config` first.",
        });
        return;
      }

      const confessionChannel = await interaction.guild.channels.fetch(config.confessionChannelId).catch(() => null);
      const auditChannel = await interaction.guild.channels.fetch(config.auditChannelId).catch(() => null);

      if (!confessionChannel || confessionChannel.type !== ChannelType.GuildText) {
        await interaction.editReply({
          content: "The configured confession channel is missing or invalid."
        });
        return;
      }

      if (!auditChannel || auditChannel.type !== ChannelType.GuildText) {
        await interaction.editReply({
          content: "The configured audit channel is missing or invalid."
        });
        return;
      }

      const alias = interaction.fields.getTextInputValue("alias").trim();
      const confessionBody = interaction.fields.getTextInputValue("confession").trim();
      const confessionEmbed = buildConfessionEmbed({ alias, body: confessionBody });

      const pingContent = config.pingRoleId ? `<@&${config.pingRoleId}>` : undefined;
      const postedMessage = await confessionChannel.send({
        content: pingContent,
        embeds: [confessionEmbed],
        components: [
          confessionButtonRow({
            guildId: interaction.guild.id,
            messageId: "pending"
          })
        ],
        allowedMentions: config.pingRoleId ? { roles: [config.pingRoleId] } : { parse: [] }
      });

      const thread = await postedMessage.startThread({
        name: `Replies to ${alias}`,
        autoArchiveDuration: 1440,
        reason: `Reply thread for confession by alias ${alias}`
      });

      await thread.send({
        content: "Use the button below to post an anonymous reply in this thread.",
        components: [threadReplyButtonRow(postedMessage.id)]
      }).catch(() => null);

      await postedMessage.edit({
        embeds: [confessionEmbed],
        components: [
          confessionButtonRow({
            guildId: interaction.guild.id,
            messageId: postedMessage.id,
            threadId: thread.id
          })
        ]
      });

      saveConfession({
        guildId: interaction.guild.id,
        messageId: postedMessage.id,
        channelId: confessionChannel.id,
        alias,
        body: confessionBody,
        authorId: interaction.user.id,
        authorUsername: interaction.user.username || null,
        authorTag: interaction.user.tag || null,
        threadId: thread.id,
        createdAt: new Date().toISOString()
      });

      const auditEmbed = buildAuditEmbed({
        alias,
        body: confessionBody,
        user: {
          tag: interaction.user.tag,
          id: interaction.user.id,
          guild: interaction.guild
        },
        confessionMessageId: postedMessage.id,
        confessionChannelId: confessionChannel.id
      });

      const auditLogged = await trySendAuditLog(
        auditChannel,
        { embeds: [auditEmbed] },
        "confession"
      );

      await interaction.editReply({
        content: auditLogged
          ? "Your confession has been posted."
          : "Your confession has been posted, but I couldn't write to the audit channel."
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("reply:")) {
      if (!interaction.guild || !interaction.channel || !interaction.message) {
        await interaction.reply({ content: "This interaction is missing server context.", ephemeral: true });
        return;
      }

      const confessionMessageId = interaction.customId.split(":")[1];
      const confessionRecord = getConfession(confessionMessageId);

      if (!confessionRecord) {
        await interaction.reply({
          content: "I couldn't find the original confession record for this post.",
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`reply-modal:${confessionMessageId}`)
        .setTitle("Reply to confession");

      const aliasInput = new TextInputBuilder()
        .setCustomId("alias")
        .setLabel("Alias for your reply")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(32)
        .setPlaceholder("Example: midnight-friend")
        .setRequired(true);

      const replyInput = new TextInputBuilder()
        .setCustomId("reply")
        .setLabel("Reply")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(1)
        .setMaxLength(1500)
        .setPlaceholder("Write your reply...")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(aliasInput),
        new ActionRowBuilder().addComponents(replyInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("reply-modal:")) {
      if (!interaction.guild) {
        await interaction.reply({ content: "This bot can only be used inside a server.", ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const confessionMessageId = interaction.customId.split(":")[1];
      const confessionRecord = getConfession(confessionMessageId);

      if (!confessionRecord) {
        await interaction.editReply({
          content: "I couldn't find the original confession record for this reply."
        });
        return;
      }

      const confessionChannel = await interaction.guild.channels.fetch(confessionRecord.channelId).catch(() => null);

      if (!confessionChannel || confessionChannel.type !== ChannelType.GuildText) {
        await interaction.editReply({
          content: "The confession channel for this post is missing."
        });
        return;
      }

      const confessionMessage = await confessionChannel.messages.fetch(confessionMessageId).catch(() => null);

      if (!confessionMessage) {
        await interaction.editReply({
          content: "The original confession message could not be found."
        });
        return;
      }

      const thread = await createReplyThread(confessionMessage, confessionRecord);
      const alias = interaction.fields.getTextInputValue("alias").trim();
      const replyBody = interaction.fields.getTextInputValue("reply").trim();
      const maxRepliesPerMember = Number.parseInt(process.env.MAX_REPLIES_PER_MEMBER_PER_CONFESSION || "0", 10);
      const isReplyLimitEnabled = Number.isFinite(maxRepliesPerMember) && maxRepliesPerMember > 0;

      if (isReplyLimitEnabled) {
        const existingReplies = listRepliesForConfession(confessionMessageId);
        const existingRepliesByMember = existingReplies.filter((reply) => reply.authorId === interaction.user.id);

        if (existingRepliesByMember.length >= maxRepliesPerMember) {
          await interaction.editReply({
            content: `You've reached the reply limit for this confession (${maxRepliesPerMember}).`
          });
          return;
        }
      }

      const replyEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("Confession Reply")
        .addFields(
          { name: "Alias", value: alias },
          { name: "Reply", value: replyBody }
        )
        .setTimestamp();

      await thread.send({
        embeds: [replyEmbed],
        components: [threadReplyButtonRow(confessionMessageId)]
      });
      saveReply({
        replyId: interaction.id,
        confessionMessageId,
        guildId: interaction.guild.id,
        threadId: thread.id,
        alias,
        body: replyBody,
        authorId: interaction.user.id,
        authorUsername: interaction.user.username || null,
        authorTag: interaction.user.tag || null,
        createdAt: new Date().toISOString()
      });

      const config = getEffectiveGuildConfig(interaction.guild.id);
      if (config.auditChannelId) {
        const auditChannel = await interaction.guild.channels.fetch(config.auditChannelId).catch(() => null);

        if (auditChannel && auditChannel.type === ChannelType.GuildText) {
          const replyAuditEmbed = buildReplyAuditEmbed({
            confessionAlias: confessionRecord.alias,
            replyAlias: alias,
            replyBody,
            user: {
              tag: interaction.user.tag,
              id: interaction.user.id,
              guild: interaction.guild
            },
            threadId: thread.id,
            confessionMessageId,
            confessionChannelId: confessionRecord.channelId
          });

          const auditLogged = await trySendAuditLog(
            auditChannel,
            { embeds: [replyAuditEmbed] },
            "reply"
          );

          await interaction.editReply({
            content: auditLogged
              ? `Your reply has been posted in <#${thread.id}>.`
              : `Your reply has been posted in <#${thread.id}>, but I couldn't write to the audit channel.`
          });
          return;
        }
      }

      await interaction.editReply({
        content: `Your reply has been posted in <#${thread.id}>.`
      });
    }
  } catch (error) {
    console.error("Interaction handling failed:", error);

    if (interaction.isRepliable()) {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: "Something went wrong while handling that action."
        }).catch(() => null);
      } else if (!interaction.replied) {
        await interaction.reply({
          content: "Something went wrong while handling that action.",
          ephemeral: true
        }).catch(() => null);
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
