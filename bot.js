const fs = require('fs');

async function run() {
    console.log("Bot ishga tushdi...");
    
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error("XATO: BOT_TOKEN topilmadi! GitHub Secrets'ga qo'shing.");
        process.exit(1);
    }

    let state = { last_update_id: 0, gemini_key: "", model: "gemini-1.5-flash" };
    try {
        if (fs.existsSync('state.json')) {
            state = JSON.parse(fs.readFileSync('state.json', 'utf8'));
        }
    } catch (e) {
        console.log("State o'qishda xato, yangilanmoqda...");
    }

    async function telegram(method, params = {}) {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return res.json();
    }

    async function askGemini(prompt) {
        if (!state.gemini_key) return "Gemini API kaliti o'rnatilmagan. /setkey [kalit] buyrug'i bilan o'rnating.";
        const fetch = (await import('node-fetch')).default;
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.gemini_key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI javob bera olmadi. Kalitni tekshiring.";
        } catch (e) {
            return "Gemini API bilan bog'lanishda xato: " + e.message;
        }
    }

    console.log("Xabarlar tekshirilmoqda...");
    const updates = await telegram('getUpdates', { offset: state.last_update_id + 1 });

    if (updates.ok && updates.result.length > 0) {
        for (const update of updates.result) {
            state.last_update_id = update.update_id;
            const msg = update.message;
            if (!msg || !msg.text) continue;

            const text = msg.text;
            const chatId = msg.chat.id;

            console.log(`Xabar keldi: ${text}`);

            if (text.startsWith('/start')) {
                await telegram('sendMessage', { chat_id: chatId, text: "Salom! Men Gemini AI botman.\n\n/setkey [kalit] - API kalit o'rnatish\n/status - Holatni ko'rish" });
            } else if (text.startsWith('/setkey')) {
                const key = text.split(' ')[1];
                if (key) {
                    state.gemini_key = key;
                    await telegram('sendMessage', { chat_id: chatId, text: "✅ API kalit saqlandi!" });
                } else {
                    await telegram('sendMessage', { chat_id: chatId, text: "Kalitni yozing: /setkey AIza..." });
                }
            } else if (text.startsWith('/status')) {
                await telegram('sendMessage', { chat_id: chatId, text: `Holat:\nKalit: ${state.gemini_key ? "O'rnatilgan ✅" : "Yo'q ❌"}\nModel: ${state.model}` });
            } else {
                const aiRes = await askGemini(text);
                await telegram('sendMessage', { chat_id: chatId, text: aiRes });
            }
        }
    }

    fs.writeFileSync('state.json', JSON.stringify(state, null, 2));
    console.log("Ish yakunlandi.");
}

run().catch(err => {
    console.error("Global xato:", err);
    process.exit(1);
});
