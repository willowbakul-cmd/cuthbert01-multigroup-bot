const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const P = require('pino');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req,res)=> res.send('Cuthbert Bot 24/7 - 9 RULES ONLY'));
app.listen(PORT, ()=> console.log('Server on '+PORT));

const PHONE_NUMBER = "2349053803973"; // CHANGE TO YOUR BOT NUMBER

// ===== 9 RULES CONFIG =====
const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|t\.me|telegram\.me|discord\.gg)/i;
const badWords = ['porn','pussy','dick','toto','mumu','fool','idiot','stupid','xxx','nude','sex','fuck','shit','asshole','bitch'];

let warnings = {}; // {userId_groupId: count}

// --- Helper: Get Group Admins ---
async function getGroupAdmins(sock, groupId){
    const meta = await sock.groupMetadata(groupId);
    return meta.participants;
}

// --- START BOT ---
async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({level:'silent'}),
        printQRInTerminal: false,
        browser: ["Ubuntu","Chrome","20.0.04"]
    });

    if(!sock.authState.creds.registered){
        await new Promise(r=> setTimeout(r, 3000));
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log(`\n\n ==> CODE IS: ${code} <== FOR: ${PHONE_NUMBER}\n\n`);
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u)=>{
        if(u.connection==='open') console.log('✅ CUTHBERT BOT ONLINE - 9 RULES ACTIVE');
        if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) startBot();
    });

    // === MESSAGE HANDLER ===
    sock.ev.on('messages.upsert', async ({messages})=>{
        try{
            const m = messages[0];
            if(!m.message || m.key.fromMe) return;
            const from = m.key.remoteJid;
            if(!from.endsWith('@g.us')) return; // group only

            const body = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";
            const lower = body.toLowerCase();
            const sender = m.key.participant;
            const metadata = await sock.groupMetadata(from);
            const isAdmin = metadata.participants.find(p=> p.id===sender)?.admin;
            const isBotAdmin = metadata.participants.find(p=> p.id===sock.user.id)?.admin;

            // === RULE 2 & 8: ANTI-LINK - DELETE ANY LINK ===
            if(linkRegex.test(body)){
                if(!isAdmin){
                    if(isBotAdmin){
                        await sock.sendMessage(from, { delete: m.key });
                    }
                    await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]} Links are not allowed! Rule 8`, mentions: [sender] });
                    return;
                }
            }

            // === RULE 3: ANTI BAD WORDS ===
            if(badWords.some(w=> lower.includes(w))){
                if(!isAdmin){
                    if(isBotAdmin) await sock.sendMessage(from, { delete: m.key });
                    await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]} Bad words not allowed! Rule 3`, mentions: [sender] });
                    return;
                }
            }

            // === RULE 4:!warn and!kick ===
            if(lower.startsWith('!warn') && isAdmin){
                const quoted = m.message.extendedTextMessage?.contextInfo?.participant;
                if(!quoted) return sock.sendMessage(from, {text: 'Reply to the person you want to warn!'});
                const target = quoted;
                const key = `${target}_${from}`;
                warnings[key] = (warnings[key] || 0) + 1;
                if(warnings[key] >= 3){
                    await sock.sendMessage(from, { text: `🚫 @${target.split('@')[0]} has 3 warnings! Kicking...`, mentions:[target] });
                    if(isBotAdmin) await sock.groupParticipantsUpdate(from, [target], 'remove');
                    delete warnings[key];
                } else {
                    await sock.sendMessage(from, { text: `⚠️ @${target.split('@')[0]} Warned! [${warnings[key]}/3]`, mentions:[target] });
                }
            }
            if(lower.startsWith('!kick') && isAdmin){
                const quoted = m.message.extendedTextMessage?.contextInfo?.participant;
                if(!quoted) return;
                if(isBotAdmin) await sock.groupParticipantsUpdate(from, [quoted], 'remove');
                await sock.sendMessage(from, { text: `Kicked @${quoted.split('@')[0]}`, mentions:[quoted] });
            }

            // === RULE 5:!all ===
            if(lower === '!all' || lower === '!everyone'){
                if(!isAdmin) return sock.sendMessage(from, {text: 'Only admins can use!all'});
                const members = metadata.participants.map(p=> p.id);
                await sock.sendMessage(from, { text: `📢 DAILY ANNOUNCEMENT - Everyone come!\n\n${body.replace('!all','').replace('!everyone','')}`, mentions: members });
            }

        }catch(e){ console.log(e) }
    });

    // === RULE 1: AUTO WELCOME ===
    sock.ev.on('group-participants.update', async (update)=>{
        try{
            const { id, participants, action } = update;
            if(action === 'add'){
                for(let user of participants){
                    await sock.sendMessage(id, { text: `👋 Welcome @${user.split('@')[0]} to the group!\n\nPlease introduce yourself:\nName, Location, What you do?\n\nRead the group rules!`, mentions:[user] });
                }
            }
            // RULE 7: CONTACT CREATOR WHEN NEW MEMBER JOINS (for approval groups)
            if(action === 'add'){
                const meta = await sock.groupMetadata(id);
                const owner = meta.owner || meta.participants.find(p=> p.admin==='superadmin')?.id;
                if(owner){
                    for(let user of participants){
                        await sock.sendMessage(owner, { text: `🔔 New member @${user.split('@')[0]} just joined group *${meta.subject}*\nPlease approve/check them.`, mentions:[user] });
                    }
                }
            }
        }catch(e){}
    });

    // === RULE 6: TAG ALL 12PM & 9PM ===
    // 12:00 PM WAT = 11:00 UTC, 9:00 PM WAT = 20:00 UTC
    cron.schedule('0 11 * * *', async ()=>{
        const groups = Object.keys(sock.groupFetchAllParticipating? await sock.groupFetchAllParticipating() : {});
        // Fallback: we will send to all groups where bot was active - stored manually not needed, we use global
        console.log('12PM appreciation trigger');
    });

    // Better: every day at 12pm and 9pm, we need to know groups - we store them from messages
    let knownGroups = new Set();
    sock.ev.on('messages.upsert', ({messages})=>{
        const from = messages[0]?.key?.remoteJid;
        if(from?.endsWith('@g.us')) knownGroups.add(from);
    });

    cron.schedule('0 11 * * *', async ()=>{ // 12pm WAT
        for(let gid of knownGroups){
            try{
                const meta = await sock.groupMetadata(gid);
                const members = meta.participants.map(p=> p.id);
                await sock.sendMessage(gid, { text: `🌞 Good Afternoon @all!\n\nWe appreciate every single one of you in *${meta.subject}* ❤️\nStay active, stay blessed! 🙏`, mentions: members });
            }catch(e){}
        }
    });

    cron.schedule('0 20 * * *', async ()=>{ // 9pm WAT
        for(let gid of knownGroups){
            try{
                const meta = await sock.groupMetadata(gid);
                const members = meta.participants.map(p=> p.id);
                await sock.sendMessage(gid, { text: `🌙 Good Evening @all!\n\nThank you all for today in *${meta.subject}* ✨\nYou all are amazing! See you tomorrow ❤️`, mentions: members });
            }catch(e){}
        }
    });
}

startBot();
