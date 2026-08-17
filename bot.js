import fs from 'fs';

// Sozlamalar
const STATE_FILE = 'state.json';

async function run() {
  console.log('Bot ishga tushdi...');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error("XATO: BOT_TOKEN topilmadi! GitHub Secrets'ga qo'shing.");
    process.exit(1);
  }

  // Holatni yuklash: offset = oxirgi ko'rilgan xabar, apiKey = Gemini kaliti
  let state = { offset: 0, apiKey: '', model: 'gemini-2.5-flash' };
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    }
  } catch (e) {
    console.log("State o'qishda xato, standart holat ishlatilmoqda:", e.message);
  }

  // Gemini kaliti: avval state'dagi, bo'lmasa GitHub secret'dagi
  const geminiKey = state.apiKey || process.env.GEMINI_API_KEY || '';

  // Telegram API — Node 20'ning ichki fetch'i (tashqi kutubxona kerak emas)
  async function telegram(method, params = {}) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!data.ok) console.error(`Telegram API xato (${method}):`, data.description);
      return data;
    } catch (e) {
      console.error(`Telegram so'rovi amalga oshmadi (${method}):`, e.message);
      return { ok: false };
    }
  }

  // Gemini'dan javob olish
  async function askGemini(prompt) {
    if (!geminiKey) {
      return "Gemini API kaliti o'rnatilmagan. /setkey [kalit] buyrug'i bilan o'rnating.";
    }
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const data = await res.json();
      return (
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        data?.error?.message ||
        'AI javob bera olmadi. Kalitni tekshiring.'
      );
    } catch (e) {
      return 'Gemini API bilan bog\'lanishda xato: ' + e.message;
    }
  }

  console.log('Xabarlar tekshirilmoqda...');
  const updates = await telegram('getUpdates', { offset: state.offset + 1 });
  const list = updates.result ?? [];

  for (const update of list) {
    state.offset = update.update_id;
    const msg = update.message;
    if (!msg || !msg.text) continue;

    const text = msg.text;
    const chatId = msg.chat.id;
    console.log(`Xabar keldi: ${text}`);

    if (text.startsWith('/start')) {
      await telegram('sendMessage', {
        chat_id: chatId,
        text: "Salom! Men Gemini AI botman.\n\n/setkey [kalit] - API kalit o'rnatish\n/status - holatni ko'rish",
      });
    } else if (text.startsWith('/setkey')) {
      const key = text.split(' ')[1];
      if (key) {
        state.apiKey = key;
        await telegram('sendMessage', { chat_id: chatId, text: '✅ API kalit saqlandi!' });
      } else {
        await telegram('sendMessage', { chat_id: chatId, text: 'Kalitni yozing: /setkey AIza...' });
      }
    } else if (text.startsWith('/status')) {
      await telegram('sendMessage', {
        chat_id: chatId,
        text: `Holat:\nKalit: ${geminiKey ? "O'rnatilgan ✅" : "Yo'q ❌"}\nModel: ${state.model}`,
      });
    } else {
      const aiRes = await askGemini(text);
      await telegram('sendMessage', { chat_id: chatId, text: aiRes });
    }
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`Ish yakunlandi. Ko'rilgan xabarlar: ${list.length}`);
}

run().catch((err) => {
  console.error('Global xato:', err);
  process.exit(1);
});
