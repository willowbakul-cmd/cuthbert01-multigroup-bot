const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const P = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// YOUR 9 RULES ONLY - JANE 24/7 + FREAKY FRIDAY
const RULES = `
*JANE BOT - 9 RULES ONLY 24/7*

1️⃣ No porn / nude / xxx (Allowed on Friday - Freaky Day 😏)
2️⃣ No spam / flood
3️⃣ No links without permission (antilink)
4️⃣ No insult / fight
5️⃣ No promoting other groups
6️⃣ Respect admins & all members
7️⃣ No fake news
8️⃣ Stay on topic
9️⃣ Follow WhatsApp rules

*Break = Remove!*
*Friday = Freaky Day - Rule 1 Free!*
`;

const linkRegex = /https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me/i;
const badWords = ['porn','xxx','nude','sex'];

let welcomeEnabled = true;

async function startJane() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
            if (shouldReconnect) startJane();
        } else if (connection === 'open') {
            console.log('JANE IS ONLINE 24/7 - CUTHBERT BOT READY!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            if (!isGroup) return;

            const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            const lowerBody = body.toLowerCase();

            const metadata = await sock.groupMetadata(from);
            const isAdmin = metadata.participants.find(p => p.id === msg.key.participant)?.admin;

            // CHECK IF TODAY IS FRIDAY
            const today = new Date().getDay();
            const isFriday = today === 5;

            // RULE 3: ANTILINK
            if (linkRegex.test(body) &&!isAdmin) {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.sendMessage(from, { text: `⚠️ @${msg.key.participant.split('@')[0]} Link not allowed! Rule 3`, mentions: [msg.key.participant] });
                return;
            }

            // RULE 1: ANTI BAD WORDS - WITH FREAKY FRIDAY EXCEPTION
            if (badWords.some(w => lowerBody.includes(w))) {
                if (isFriday) {
                    await sock.sendMessage(from, { text: `😏 FREAKY FRIDAY! Today Rule 1 is FREE! Enjoy @${msg.key.participant.split('@')[0]}`, mentions: [msg.key.participant] });
                    return;
                } else if (!isAdmin) {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { text: `⚠️ Bad word detected! Rule 1 - Not Friday yet!` });
                    return;
                }
            }

            // COMMANDS
            if (lowerBody === '.rules' || lowerBody === '.menu') {
                await sock.sendMessage(from, { text: RULES });
            }

            if (lowerBody === '.alive') {
                await sock.sendMessage(from, { text: `✅ JANE IS ALIVE 24/7\nOwner: CUTHBERT01\nRules: 9 ONLY\nFriday = Freaky Day 😏` });
            }

            if (lowerBody.startsWith('.welcome on') && isAdmin) {
                welcomeEnabled = true;
                await sock.sendMessage(from, { text: '✅ Welcome ON' });
            }
            if (lowerBody.startsWith('.welcome off') && isAdmin) {
                welcomeEnabled = false;
                await sock.sendMessage(from, { text: '❌ Welcome OFF' });
            }

        } catch (e) { console.log(e); }
    });

    // WELCOME & GOODBYE
    sock.ev.on('group-participants.update', async (update) => {
        if (!welcomeEnabled) return;
        try {
            const { id, participants, action } = update;
            for (let user of participants) {
                if (action === 'add') {
                    await sock.sendMessage(id, { text: `👋 Welcome @${user.split('@')[0]} to the group!\n\n${RULES}`, mentions: [user] });
                } else if (action === 'remove') {
                    await sock.sendMessage(id, { text: `👋 @${user.split('@')[0]} left. Bye bye!`, mentions: [user] });
                }
            }
        } catch (e) {}
    });
}

app.get('/', (req, res) => res.send('JANE BOT 24/7 - CUTHBERT01 - 9 RULES ONLY + FREAKY FRIDAY - ONLINE'));

app.listen(PORT, () => console.log('Server on ' + PORT));

startJane();
