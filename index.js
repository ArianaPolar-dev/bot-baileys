const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const pino = require('pino');

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Baileys Bot', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Escanea este código QR en WhatsApp Web para conectar:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || 'unknown';
      console.log(`🔌 Conexión cerrada por motivo: ${reason}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Se desconectó porque se cerró sesión. Debes volver a escanear el QR.');
      } else {
        console.log('🔄 Intentando reconectar...');
        startSock();
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

    // Comando .all
    if (body === '.all') {
      const metadata = await sock.groupMetadata(sender);
      const mentions = metadata.participants.map(p => p.id);
      const text = metadata.participants.map(p => `@${p.id.split('@')[0]}`).join(' ');
      await sock.sendMessage(sender, {
        text: text,
        mentions: mentions
      });
    }

    // Comando .open
    if (body === '.open') {
      await sock.groupSettingUpdate(sender, 'not_announcement');
      await sock.sendMessage(sender, { text: '🔓 Grupo abierto. Todos pueden escribir.' });
    }

    // Comando .close
    if (body === '.close') {
      await sock.groupSettingUpdate(sender, 'announcement');
      await sock.sendMessage(sender, { text: '🔒 Grupo cerrado. Solo administradores pueden escribir.' });
    }
  });
}

startSock();


