const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const P = require('pino');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Cuthbert Bot 24/7 - 9 RULES - Warns Everyone'));
app.listen(PORT, () => console.log('Server on ' + PORT));

const PHONE_NUMBER = "2349053803973"; // your bot number

const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|t\.me|telegram\.me|discord\.gg)/i;
// add your bad words here - I leave the heavy one out so chat no block, you fit add am for GitHub
const badWords = ['porn','dick','mumu','fool','idiot','stupid','xxx','nude','sex','fuck','shit','asshole','bitch','toto'];

let warnings = {};
let knownGroups = new Set();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered) {
        await new Promise(r => setTimeout(r, 3000));
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log(`\n\n ==> YOUR CODE: ${code} <== FOR ${PHONE_NUMBER}\n\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') console.log('✅ CUTHBERT ONLINE - WARNS EVERYONE INCLUDING ADMIN');
        if (u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) {
            startBot();
        }
    });

    // MESSAGE HANDLER - ALL 9 RULES
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;
            const from = m.key.remoteJid;
            if (!from.endsWith('@g.us')) return; // group only

            knownGroups.add(from);

            const body = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";
            const lower = body.toLowerCase();
            const sender = m.key.participant;

            const metadata = await sock.groupMetadata(from);
            const isAdmin = metadata.participants.find(p => p.id === sender)?.admin;
            const isBotAdmin = metadata.participants.find(p => p.id === sock.user.id)?.admin;

            // 1. SHOW RULES - Must be first
            if (lower === '!rules' || lower === '!menu' || lower === '!help') {
                return await sock.sendMessage(from, {
                    text: `📜 *CUTHBERT 9 RULES* 📜

*1.* Introduce yourself when you join
*2.* No links - auto delete (EVERYONE including admin)
*3.* No bad words - auto delete (EVERYONE including admin)
*4.* 3 Warnings = Auto Kick
*5.* Admins use:!warn (reply user),!kick (reply user)
*6.* Admins use:!all YourMessage - tags everyone
*7.* Daily appreciation 12PM & 9PM WAT tags all
*8.* New member notified to group owner
*9.* Bot must be admin to delete/kick - 24/7 Active

Type!rules to see again ✅`
                });
            }

            // 2 & 8. ANTI-LINK - WARNS EVERYONE
            if (linkRegex.test(body)) {
                if (isBotAdmin) await sock.sendMessage(from, { delete: m.key });
                return await sock.sendMessage(from, {
                    text: `⚠️ @${sender.split('@')[0]} Links not allowed! Even admin no fit send link 🚫 Rule 8`,
                    mentions: [sender]
                });
            }

            // 3. ANTI BAD WORDS - WARNS EVERYONE
            if (badWords.some(w => lower.includes(w))) {
                if (isBotAdmin) await sock.sendMessage(from, { delete: m.key });
                return await sock.sendMessage(from, {
                    text: `⚠️ @${sender.split('@')[0]} Bad words not allowed! Even admin must respect Rule 3 🚫`,
                    mentions: [sender]
                });
            }

            // 4. WARN / KICK SYSTEM - Admin only
            if (lower.startsWith('!warn') && isAdmin) {
                const quoted = m.message.extendedTextMessage?.contextInfo?.participant;
                if (!quoted) return sock.sendMessage(from, { text: 'Reply to the person you want to warn!' });
                const key = `${quoted}_${from}`;
                warnings[key] = (warnings[key] || 0) + 1;
                if (warnings[key] >= 3) {
                    await sock.sendMessage(from, { text: `🚫 @${quoted.split('@')[0]} has 3 warnings! Kicking...`, mentions: [quoted] });
                    if (isBotAdmin) await sock.groupParticipantsUpdate(from, [quoted], 'remove');
                    delete warnings[key];
                } else {
                    await sock.sendMessage(from, { text: `⚠️ @${quoted.split('@')[0]} Warned! [${warnings[key]}/3]`, mentions: [quoted] });
                }
            }

            if (lower.startsWith('!kick') && isAdmin) {
                const quoted = m.message.extendedTextMessage?.contextInfo?.participant;
                if (!quoted) return;
                if (isBotAdmin) await sock.groupParticipantsUpdate(from, [quoted], 'remove');
                await sock.sendMessage(from, { text: `Kicked @${quoted.split('@')[0]}`, mentions: [quoted] });
            }

            // 5. TAG ALL
            if (lower.startsWith('!all') || lower.startsWith('!everyone')) {
                if (!isAdmin) return sock.sendMessage(from, { text: 'Only admins can use!all' });
                const members = metadata.participants.map(p => p.id);
                const customText = body.replace(/!all|!everyone/i, '').trim() || 'Everyone come!';
                await sock.sendMessage(from, { text: `📢 ANNOUNCEMENT - ${customText}`, mentions: members });
            }

        } catch (e) {
            console.log('Error:', e.message);
        }
    });

    // RULE 1 & 7: WELCOME + NOTIFY OWNER
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { id, participants, action } = update;
            if (action === 'add') {
                for (let user of participants) {
                    await sock.sendMessage(id, {
                        text: `👋 Welcome @${user.split('@')[0]} to the group!\n\nPlease introduce yourself:\nName, Location, What you do?\n\nType!rules to read rules!`,
                        mentions: [user]
                    });
                    const meta = await sock.groupMetadata(id);
                    const owner = meta.owner || meta.participants.find(p => p.admin === 'superadmin')?.id;
                    if (owner) {
                        await sock.sendMessage(owner, {
                            text: `🔔 New member @${user.split('@')[0]} just joined *${meta.subject}*`,
                            mentions: [user]
                        });
                    }
                }
            }
        } catch (e) {}
    });

    // RULE 6: DAILY 12PM & 9PM WAT (11:00 & 20:00 UTC)
    cron.schedule('0 11 * * *', async () => {
        for (let gid of knownGroups) {
            try {
                const meta = await sock.groupMetadata(gid);
                const members = meta.participants.map(p => p.id);
                await sock.sendMessage(gid, { text: `🌞 Good Afternoon @all!\n\nWe appreciate everyone in *${meta.subject}* ❤️ Stay active! 🙏`, mentions: members });
            } catch (e) {}
        }
    });

    cron.schedule('0 20 * * *', async () => {
        for (let gid of knownGroups) {
            try {
                const meta = await sock.groupMetadata(gid);
                const members = meta.participants.map(p => p.id);
                await sock.sendMessage(gid, { text: `🌙 Good Evening @all!\n\nThank you for today in *${meta.subject}* ✨ You all are amazing! ❤️`, mentions: members });
            } catch (e) {}
        }
    });
}

startBot();
