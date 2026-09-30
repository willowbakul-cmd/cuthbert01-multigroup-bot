const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const express = require('express');
const P = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req,res)=>res.send('JANE BOT 24/7 ONLINE - CUTHBERT'));
app.listen(PORT, ()=>console.log('Server on '+PORT));

// YOUR 9 RULES
const RULES = `
*⚠️ JANE BOT - 9 STRICT RULES ⚠️*

1️⃣ No porn / nude / xxx / sex content
2️⃣ No spam / flooding / repeating message
3️⃣ No links - WhatsApp, Telegram, website, any link
4️⃣ No insult / fighting / abusing
5️⃣ No promoting other groups / business
6️⃣ Respect all admins & members
7️⃣ No fake news / scam
8️⃣ Stay on topic / No off-topic
9️⃣ Follow WhatsApp rules

*BREAK RULE = DELETE + WARN*
*SEND LINK = DELETE + REMOVE*
`;

// DELETE ANY LINK - THIS IS VERY STRICT
const linkRegex = /https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|t\.me|telegram\.me|discord\.gg|discord\.com|bit\.ly|tinyurl|\.com|\.net|\.org/i;

// MANY BAD WORDS - ADD MORE HERE
const badWords = [
'porn','xxx','nude','sex','pornhub','xvideos','xnxx','onlyfans',
'fuck','shit','bitch','asshole','bastard','dick','pussy',
'scam','fake','spam','flood'
];

async function startJane(){
const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
const sock = makeWASocket({
auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, P({level:"silent"})) },
logger: P({level:"silent"}),
printQRInTerminal: true,
browser: ["JANE BOT","Chrome","1.0.0"]
});
sock.ev.on('creds.update', saveCreds);

if(!state.creds.registered){
const phoneNumber = "2349053803973";
setTimeout(async()=>{
try{
let code = await sock.requestPairingCode(phoneNumber);
console.log(`\n\nYOUR PAIRING CODE: ${code}\n\n`);
}catch(e){ console.log(e); }
},3000);
}

sock.ev.on('connection.update', (u)=>{
const { connection, lastDisconnect } = u;
if(connection==='close'){
const reconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
if(reconnect) startJane();
}else if(connection==='open'){ console.log('JANE IS ONLINE!'); }
});

sock.ev.on('messages.upsert', async ({ messages })=>{
try{
const msg = messages[0];
if(!msg.message || msg.key.fromMe) return;
const from = msg.key.remoteJid;
if(!from.endsWith('@g.us')) return;

const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
const lower = body.toLowerCase();
const sender = msg.key.participant;

const metadata = await sock.groupMetadata(from);
const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
const isBotAdmin = metadata.participants.find(p=>p.id===botId || p.id===sock.user.id)?.admin;
const isSenderAdmin = metadata.participants.find(p=>p.id===sender)?.admin;
if(!isBotAdmin) return;
if(isSenderAdmin) return; // Don't touch admins

const hasLink = linkRegex.test(body);
const hasBadWord = badWords.some(w=> lower.includes(w));

if(hasLink || hasBadWord){
// 1. DELETE MESSAGE IMMEDIATELY
await sock.sendMessage(from, { delete: msg.key });

// 2. IF LINK -> REMOVE FROM GROUP
if(hasLink){
await sock.sendMessage(from, {
text: `🚫 *LINK DETECTED - REMOVED* 🚫\n\n👤 @${sender.split('@')[0]} sent a link!\n\n❌ Any link is not allowed!\n👢 User Removed!`,
mentions: [sender]
});
await sock.groupParticipantsUpdate(from, [sender], "remove");
return;
}

// 3. IF BAD WORD -> ONLY WARN + DELETE (NO REMOVE)
if(hasBadWord){
const warnText = `⚠️ *RULE BROKEN - MESSAGE DELETED* ⚠️\n\n👤 @${sender.split('@')[0]}\nReason: Bad word / Rule 1,2,4,7\n\n❌ Message deleted\n⚠️ Warning 1 - Next time be careful!\n\n${RULES}`;
await sock.sendMessage(from, {
text: warnText,
mentions: [sender],
footer: "JANE SECURITY 🛡️",
buttons: [
{buttonId: 'rules', buttonText: {displayText: "📜 Rules"}, type: 1},
{buttonId: `warn_${sender}`, buttonText: {displayText: "⚠️ WARN"}, type: 1}
],
headerType: 1
});
}
}
if(lower==='.rules' || lower==='.menu'){
await sock.sendMessage(from, {text:RULES});
}
if(lower==='.alive'){
await sock.sendMessage(from, {text:'✅ JANE IS ALIVE 24/7 - READY TO DELETE LINKS!'});
}
}catch(e){console.log(e);}
});
}
startJane();
