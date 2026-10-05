# Rasch Test Bot

Test javoblarini **Rasch modeli** (JMLE) asosida baholovchi Telegram bot. Node.js + grammY + MongoDB.

## O'rnatish

1. Node.js 20+ o'rnatilgan bo'lsin.
2. `npm install`
3. `.env.example` dan nusxa olib `.env` yarating va to'ldiring:
   - `BOT_TOKEN` — [@BotFather](https://t.me/BotFather) → `/newbot`
   - `MONGODB_URI` — MongoDB Atlas → Database → Connect → Drivers. Atlas'da **Network Access** bo'limida server IP manzilini (yoki `0.0.0.0/0`) qo'shing.
   - `ADMIN_IDS` — adminlarning Telegram ID lari (vergul bilan). ID ni bilish uchun botni ishga tushirib `/id` yuboring.
4. `npm start`

## Ishlash tartibi

**Admin**
1. «➕ Yangi test» → test nomi → yopiq savollar kaliti (`abcd...` yoki `1a2b3c...`, A–F) → ochiq savollar kaliti (har qatorda `36a=12`, muqobil javoblar `;` bilan: `37=0.5;1/2`).
2. Bot test **kodi** va havolasini beradi (`https://t.me/<bot>?start=<kod>`).
3. «📋 Testlar» → testni tanlab «🔒 Yopish va hisoblash». Bot Rasch bo'yicha hisoblaydi, har bir qatnashchiga natijasini yuboradi, adminga qisqa hisobot va Excel fayl jo'natadi.

**O'quvchi**
1. Birinchi kirishda ism-familiya kiritadi.
2. Test kodini yuboradi (yoki havola orqali kiradi).
3. Yopiq javoblar bitta xabarda (`abcd...`, javobsiz savolga `x`), ochiq javoblar har biri yangi qatorda.
4. Tasdiqlaydi. Natija test yopilganda keladi.

## Baholash

BMBA'ning [baholash mezonlari](https://uzbmb.uz/upload/file/pdf/mtt/Baholash_mezoni.pdf) asosida:

- Har bir savol to'g'ri/xato (1/0) deb olinadi; ochiq savolning har bir qismi (36a, 36b) alohida savol hisoblanadi (Milliy sertifikat matematika: 45 topshiriq → 55 item).
- **Savol qiyinligi (b) — CML** (conditional maximum likelihood). BMBA R dagi `dexter` paketidan foydalanadi, u ham CML bilan kalibrlaydi. Hamma yoki hech kim yechmagan savollar qatnashchilarni farqlamaydi va hisobdan chiqariladi. Ma'lumot to'liq "zinapoya" (Guttman) shaklida bo'lsa, CML yechimi mavjud emas, shunda zaif prior N(0, 3²) qo'shiladi.
- **Qobiliyat (θ) — WLE** (Warm, 1989): 0 va maksimal ball uchun ham chekli natija beradi.
- **T-ball = 50 + 10·Z**, Z = (θ − μ) / σ. σ — tanlanma standart og'ishi (R dagi `sd()` kabi). Ball [0; 75] oralig'ida: BMBA bo'yicha maksimal ball shartli ravishda 75.
- Darajalar: A+ ≥ 70, A ≥ 65, B+ ≥ 60, B ≥ 55, C+ ≥ 50, C ≥ 46, undan past — o'tmadi (`src/lib/scoring.js` → `GRADES`).
- Rasch modelida bitta testda **bir xil sondagi to'g'ri javob — bir xil ball** (xom ball yetarli statistika). Rasch javoblar sonini chiziqsiz logit shkalaga o'tkazadi, bu shkala savollar qiyinligiga bog'liq.
- Ball **shu test qatnashchilariga nisbatan** standartlashtiriladi (o'rtacha = 50). Kuchli sinfda o'rtacha o'quvchi ham ~50 oladi. Natija respublika bo'yicha Milliy sertifikat bali bilan bir xil emas.
- Qatnashchilar 30 tadan kam bo'lsa, Rasch baholari noaniq bo'ladi va bot adminni ogohlantiradi.

### Natijalarni e'lon qilish

1. «🔒 Yopish va hisoblash» — natijalar hisoblanadi, lekin faqat **adminga** ko'rsatiladi: xulosa, Excel va shubhali savollar ro'yxati.
2. Shubhali savollar avtomatik aniqlanadi: hech kim yechmagan savol; tuzatilgan nuqta-biserial korrelyatsiya < −0.1 (kuchli o'quvchilar ko'proq xato qilgan — kalit xato bo'lishi mumkin); infit MNSQ > 1.5. Simulyatsiyada 30+ qatnashchili testda xato kiritilgan kalitlarning 93–100% i ushlandi.
3. Kalit xato bo'lsa — «✏️ Kalitni tuzatish» (`7=c`, `31a=12;12.0`). Barcha javoblar qayta tekshiriladi va Rasch qayta hisoblanadi. «🔓 Qayta ochish» bilan testga yana javob qabul qilish mumkin.
4. «📤 Natijalarni yuborish» — natijalar qatnashchilarga yuboriladi. Shundan keyin kalitni o'zgartirib bo'lmaydi. Bot yuborish jarayonida to'xtab qolsa, qayta ishga tushganda qolganlarini yuboradi.

Ochiq javoblar solishtirilganda katta-kichik harf va bo'shliqlar e'tiborga olinmaydi, sonlar qiymati bo'yicha tekshiriladi (`0,5` = `0.5` = `1/2`), kirill klaviaturada terilgan o'xshash harflar lotinga o'giriladi.

## Render'ga joylash (bepul tarif)

Render'ning bepul tarifida Background Worker yo'q, shuning uchun bot **Web Service** sifatida **webhook** rejimida ishlaydi. `RENDER_EXTERNAL_URL` (yoki `WEBHOOK_URL`) bo'lsa, webhook avtomatik yoqiladi, lokal ishga tushirilganda esa long polling ishlatiladi.

1. MongoDB Atlas → **Network Access** → `0.0.0.0/0` qo'shing (Render bepul tarifida doimiy IP yo'q).
2. [Render](https://dashboard.render.com) → **New → Blueprint** → shu repo'ni tanlang (`render.yaml` o'qiladi).
3. `BOT_TOKEN`, `MONGODB_URI`, `ADMIN_IDS` qiymatlarini kiriting → **Apply**.
4. Deploy tugagach, bot Telegram'ga webhook'ni o'zi o'rnatadi. Tekshirish uchun brauzerda `https://<servis>.onrender.com/health` → `ok`.

Bepul tarif cheklovlari:
- 15 daqiqa so'rov kelmasa server uxlaydi. Keyingi xabarga birinchi javob ~1 daqiqa kechikadi (Telegram xabarni yo'qotmaydi, qayta yuboradi).
- Bot Render'da ishlayotganda uni **lokal ishga tushirmang**: long polling Render'dagi webhook'ni o'chirib yuboradi. Lokal ishlatish kerak bo'lsa, boshqa test bot tokenidan foydalaning.

## Sinov

```bash
npm test
```

`test/flow.test.js` — soxta Telegram API va haqiqiy MongoDB bilan to'liq oqim testi (`.env` dagi `MONGODB_URI` ishlatiladi, `rasch_bot_flowtest` bazasi yaratilib, oxirida o'chiriladi).

`.env` da `ENABLE_SIMULATE=true` bo'lsa, admin `/simulate <kod> <soni>` bilan testga tasodifiy sinov qatnashchilarini qo'sha oladi (ishlab chiqarishda o'chirib qo'ying).

## Tuzilma

```
src/
  index.js              ishga tushirish
  config.js, db.js
  models/               User, Test, Submission
  lib/rasch.js          Rasch: CML (savollar), WLE (qatnashchilar), moslik statistikalari
  lib/scoring.js        T-ball, daraja, o'rin
  lib/answers.js        kalit/javoblarni o'qish va tekshirish
  lib/report.js         Excel hisobot
  services/testService.js
  bot/                  menyular, admin va o'quvchi oqimlari
test/                   unit va oqim testlari
```
