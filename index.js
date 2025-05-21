const express = require('express');
const app = express();
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useSingleFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// Servidor web para mantener vivo en Railway o Replit
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('🟢 Bot activo');
});
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`);
});

async function startSock() {
  const { state, saveState } = useSingleFileAuthState('./auth_info.json');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Baileys Bot', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveState);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Escanea este código QR con WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || 'unknown';
      console.log(`🔌 Conexión cerrada por motivo: ${reason}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Se cerró la sesión. Debes escanear nuevamente.');
      } else {
        console.log('🔄 Intentando reconectar...');
        startSock(); // Reintento
      }
    } else if (connection === 'open') {
      console.log('✅ Bot conectado con éxito usando Baileys');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text;
    const isGroup = sender.endsWith('@g.us');

    if (!isGroup || !body) return;

    if (body === '.all') {
      const metadata = await sock.groupMetadata(sender);
      const mentions = metadata.participants.map(p => p.id);
      const text = metadata.participants.map(p => `@${p.id.split('@')[0]}`).join(' ');
      await sock.sendMessage(sender, {
        text,
        mentions
      });
    }

    if (body === '.open') {
      await sock.groupSettingUpdate(sender, 'not_announcement');
      await sock.sendMessage(sender, { text: '🔓 Grupo abierto. Todos pueden escribir.' });
    }

    if (body === '.close') {
      await sock.groupSettingUpdate(sender, 'announcement');
      await sock.sendMessage(sender, { text: '🔒 Grupo cerrado. Solo administradores pueden escribir.' });
    }
  });
}

startSock();
