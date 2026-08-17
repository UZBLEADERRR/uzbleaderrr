// Telegram yangiliklar boti — Gemini AI bilan
import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN = process.env.BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!TOKEN) {
  console.error('XATO: BOT_TOKEN yoʻq — repo Secrets ga qoʻshing');
  process.exit(0);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const MODEL = 'gemini-2.5-flash';

// Gemini AI orqali yangilik generatsiya qilish
async function getAIUpdate() {
  if (!GEMINI_KEY) {
    return "Gemini API kaliti topilmadi. Iltimos, GitHub Secrets ga GEMINI_API_KEY qo'shing.";
  }

  const prompt = "Bugungi dunyo yangiliklari, texnologiya va qiziqarli voqealar haqida qisqacha, 5-6 ta banddan iborat o'zbek tilida ma'lumot ber. Har bir yangilik qisqa va lo'nda bo'lsin.";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const data = await response.json();

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;

    const errMsg = data?.error?.message;
    if (errMsg) return `Gemini xatosi: ${errMsg}`;

    return "Yangiliklarni yuklashda noma'lum xatolik yuz berdi.";
  } catch (e) {
    return `Yangiliklarni yuklashda xatolik: ${e.message}`;
  }
}

function loadState() {
  try {
    const raw = readFileSync('state.json', 'utf8');
    const parsed = JSON.parse(raw);
    return { offset: parsed.offset ?? parsed.last_update_id ?? 0 };
  } catch {
    return { offset: 0 };
  }
}

async function send(chatId, text) {
  try {
    const res = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`Xabar yuborishda xato (${chatId}):`, data.description);
    }
  } catch (e) {
    console.error('Xabar yuborishda xato:', e.message);
  }
}

async function main() {
  const state = loadState();

  let data;
  try {
    const res = await fetch(`${API}/getUpdates?offset=${state.offset}&timeout=0`);
    data = await res.json();
  } catch (e) {
    console.error('getUpdates soʻrovida xato:', e.message);
    return;
  }

  if (!data.ok) {
    console.error('Telegram getUpdates xato:', data.description);
    return;
  }

  for (const update of data.result ?? []) {
    state.offset = (update.update_id ?? 0) + 1;
    const message = update.message;
    const chatId = message?.chat?.id;
    if (!chatId) continue;

    const text = (message.text || '').trim().toLowerCase();

    if (text === '/start') {
      await send(chatId, 'Yangiliklar tayyorlanmoqda...');
      const aiNews = await getAIUpdate();
      await send(chatId, `Bugungi yangiliklar:\n\n${aiNews}`);
    } else {
      await send(chatId, "Yangiliklarni olish uchun /start buyrug'ini yuboring.");
    }
  }

  try {
    writeFileSync('state.json', JSON.stringify(state, null, 2));
    console.log('Ish yakunlandi. offset =', state.offset);
  } catch (e) {
    console.error('state.json saqlashda xato:', e.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Global xato:', err);
    process.exit(0);
  });
