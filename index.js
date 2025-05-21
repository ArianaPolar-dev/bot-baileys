const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const pino = require('pino');

let qrCooldown = false; // bandera para evitar múltiples QR por minuto

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Baileys Bot', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !qrCooldown) {
      qrCooldown = true;

      // Guarda el QR como imagen
      await QRCode.toFile('qr.png', qr);
      console.log('📷 Código QR guardado como qr.png. Ábrelo para escanearlo desde WhatsApp.');

      // Espera 2 minutos antes de permitir otro QR
      setTimeout(() => {
        qrCooldown = false;
        console.log('⏳ Puedes escanear un nuevo QR si lo necesitas.');
      }, 2 * 60 * 1000);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || 'unknown';
      console.log(`🔌 Conexión cerrada por motivo: ${reason}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Se cerró la sesión. Deberás escanear el QR nuevamente.');
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
