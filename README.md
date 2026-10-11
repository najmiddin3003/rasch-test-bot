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
1. «➕ Yangi test» → test nomi → **format**:
   - **Ona tili (Milliy sertifikat)**: 1–32 A–D, 33–35 A–F, 36–39 bitta yozma javob, 40–44 ikki yozma javob (a, b), oxirida esse. Admin 35 ta harfli kalitni (`abcd...` yoki `1a2b3c...`) va 14 ta yozma javobni (har qatorda bittadan yoki `36=javob`, muqobillar `;` bilan) kiritadi.
   - **Erkin format**: yopiq savollar variantlari soni (4/5/6), yopiq kalit, yozma kalit (`36a=12`, `37=0.5;1/2`), esse bor/yo'q.
2. Bot test **kodi** va havolasini beradi (`https://t.me/<bot>?start=<kod>`).
3. «📋 Testlar» → testni tanlab «🔒 Yopish va hisoblash» (pastda batafsil). Ro'yxatda faol testlar doim tepada, tugagan testlar bazadan 5 tadan olinadi (oxirgi yopilgani birinchi), «⬅️ Oldingi» / «Keyingi ➡️» bilan varaqlanadi.

**O'quvchi**
1. Birinchi kirishda ism-familiya kiritadi.
2. Test kodini yuboradi (yoki havola orqali kiradi).
3. **Yopiq savollar — tugmalar bilan**: bitta xabar joyida almashib turadi (har savol uchun yangi xabar yuborilmaydi), «⏭ O'tkazish» bor. Barcha yopiq javoblarni bitta xabarda (`abcd...`) yuborish ham mumkin.
4. **Yozma savollar — bittalab**: bot «36-savol — javobingizni yozing» deydi, o'quvchi nima yozsa, shu qabul qilinadi; «⏭ O'tkazish» tugmasi bor.
5. **Esse** (esseli testda): o'quvchi esse balini 0–75 oralig'ida kiritadi yoki o'tkazadi (0 ball).
6. Javoblarni tekshiradi, kerak bo'lsa `12=b`, `37=javob`, `esse=60` deb tuzatadi va tasdiqlaydi. Natija test yopilganda keladi.

**Yozma javoblarni solishtirish**: katta-kichik harf va bo'shliqlar e'tiborga olinmaydi; tutuq belgisining barcha ko'rinishlari (`'` `` ` `` `‘` `’` `ʻ` `ʼ`) va «tutuq belgisi» so'zi bir xil; tire/chiziqcha belgilari (`-` `–` `—` `−`) va «tire» so'zi bir xil; «vergul», «nuqta», «ikki nuqta», «so'roq belgisi» kabi so'zlar tegishli belgiga teng; sonlar qiymati bo'yicha (`0,5` = `0.5` = `1/2`).

## Baholash

BMBA'ning [baholash mezonlari](https://uzbmb.uz/upload/file/pdf/mtt/Baholash_mezoni.pdf) asosida:

- Har bir savol to'g'ri/xato (1/0) deb olinadi; ochiq savolning har bir qismi (36a, 36b) alohida savol hisoblanadi (Milliy sertifikat matematika: 45 topshiriq → 55 item).
- **Savol qiyinligi (b) — CML** (conditional maximum likelihood). BMBA R dagi `dexter` paketidan foydalanadi, u ham CML bilan kalibrlaydi. Hamma yoki hech kim yechmagan savollar qatnashchilarni farqlamaydi va hisobdan chiqariladi. Ma'lumot to'liq "zinapoya" (Guttman) shaklida bo'lsa, CML yechimi mavjud emas, shunda zaif prior N(0, 3²) qo'shiladi.
- **Qobiliyat (θ) — WLE** (Warm, 1989): 0 va maksimal ball uchun ham chekli natija beradi.
- **T-ball = 50 + 10·Z**, Z = (θ − μ) / σ. σ — tanlanma standart og'ishi (R dagi `sd()` kabi). Ball [0; 75] oralig'ida: BMBA bo'yicha maksimal ball shartli ravishda 75.
- **Esseli testda** (BMBA: ona tili va adabiyot — test va yozma ish ikki bo'lim): **umumiy ball = (test bali + esse bali) / 2**, ikkalasi ham 75 ballik shkalada. Esse kiritilmasa — 0. Daraja va o'rin umumiy ball bo'yicha.
- Darajalar: A+ ≥ 70, A ≥ 65, B+ ≥ 60, B ≥ 55, C+ ≥ 50, C ≥ 46, undan past — o'tmadi (`src/lib/scoring.js` → `GRADES`).
- Rasch modelida bitta testda **bir xil sondagi to'g'ri javob — bir xil ball** (xom ball yetarli statistika). Rasch javoblar sonini chiziqsiz logit shkalaga o'tkazadi, bu shkala savollar qiyinligiga bog'liq.
- Ball **shu test qatnashchilariga nisbatan** standartlashtiriladi (o'rtacha = 50). Kuchli sinfda o'rtacha o'quvchi ham ~50 oladi. Natija respublika bo'yicha Milliy sertifikat bali bilan bir xil emas.
- Qatnashchilar 30 tadan kam bo'lsa, Rasch baholari noaniq bo'ladi va bot adminni ogohlantiradi.

### Natijalarni e'lon qilish

1. «🔒 Yopish va hisoblash» — natijalar hisoblanadi, lekin faqat **adminga** ko'rsatiladi: xulosa, Excel va shubhali savollar ro'yxati.
2. Shubhali savollar avtomatik aniqlanadi: hech kim yechmagan savol (5+ qatnashchida); tuzatilgan nuqta-biserial korrelyatsiya < −0.1 (kuchli o'quvchilar ko'proq xato qilgan — kalit xato bo'lishi mumkin); infit MNSQ > 1.5. Simulyatsiyada 30+ qatnashchili testda xato kiritilgan kalitlarning 93–100% i ushlandi.
   **Surilgan kalit** ham aniqlanadi: kalit kiritishda bitta javob ikki qatorga bo'linib ketsa yoki tushib qolsa, o'quvchilarning javoblari qo'shni savol kalitiga mos keladi. Bot «Kalit surilganga o'xshaydi: 6 kishi 39-savol kalitini yozgan» deb ogohlantiradi va «✏️ Kalitni tuzatish» da tayyor tuzatishni taklif qiladi (yozma savolda 5+ qatnashchi, yopiq savolda kamida 3 ta ketma-ket savol).
3. Kalit xato bo'lsa — «✏️ Kalitni tuzatish» (`7=c`, `31a=12;12.0`). Barcha javoblar qayta tekshiriladi va Rasch qayta hisoblanadi. «🔓 Qayta ochish» bilan testga yana javob qabul qilish mumkin.
4. «📤 Natijalarni yuborish» — natijalar qatnashchilarga yuboriladi. Bot yuborish jarayonida to'xtab qolsa, qayta ishga tushganda qolganlarini yuboradi.
5. Natijalar yuborilgandan keyin xato topilsa ham «✏️ Kalitni tuzatish» mumkin: natijalar qayta hisoblanadi, test yana «yuborishni kutmoqda» holatiga qaytadi va «📤 Natijalarni yuborish» bosilganda har bir o'quvchiga «Natijangiz qayta hisoblandi» deb yangi natija boradi. Bunday testni qayta ochib bo'lmaydi.

Hech kim javob yubormagan test yopilsa, hisob-kitob va yuborish bosqichi bo'lmaydi: adminga «Ishtirokchilar mavjud emas — test yopildi» deb chiqadi, hech kimga xabar yuborilmaydi. Yopishdan oldin bot javob kiritishni boshlagan, lekin hali yubormagan o'quvchilar sonini ham ogohlantiradi.

Kalit va o'quvchi javobi boshidagi savol raqami va harfi (`36-Qora`, `40-a)ta'sir`, `b)chunki`, `A k`) e'tiborga olinmaydi; tartib bilan yozilgan kalitda qator boshqa savol raqami bilan boshlansa (`38` o'rnida `39-...`), bot tartib buzilganini aytadi.

Ochiq javoblar solishtirilganda katta-kichik harf va bo'shliqlar e'tiborga olinmaydi, sonlar qiymati bo'yicha tekshiriladi (`0,5` = `0.5` = `1/2`), kirill klaviaturada terilgan o'xshash harflar lotinga o'giriladi.

## Vercel'ga joylash (bepul, hozirgi hosting)

Vercel'da bot serverless funksiya sifatida ishlaydi: `api/telegram.js` — Telegram webhook, `api/health.js` — tekshiruv. `vercel.json` da funksiyalar Sidneyda (`syd1`, MongoDB Atlas yonida) joylashadi, har biri ko'pi bilan 60 soniya ishlaydi.

1. Vercel → **Add New → Project** → GitHub'dagi shu repo (har `git push` da avtomatik joylanadi).
2. **Settings → Environment Variables**: `BOT_TOKEN`, `MONGODB_URI` (maxfiy), `MONGODB_DB=rasch_bot`, `ADMIN_IDS`, `ENABLE_SIMULATE=false` → qayta joylash (Redeploy).
3. Brauzerda `https://<loyiha>.vercel.app/api/health` → `{"ok":true,...}`.
4. Webhook'ni ulash (bir marta, kompyuterdan, `.env` dagi `BOT_TOKEN` bilan): `node scripts/set-webhook.js https://<loyiha>.vercel.app`

Telegram yangilanishlarni ketma-ket yuboradi (`max_connections: 1`); natijalarni yuborish javobdan keyin fonda (`waitUntil`) davom etadi. Funksiya nusxalari ko'p bo'lishi mumkinligi uchun foydalanuvchi keshi o'chirilgan. Bot boshqa joyda (kompyuter yoki Render) ishga tushirilsa, webhook o'sha yerga o'tadi — bir vaqtda faqat bittasi ishlasin.

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
api/                    Vercel funksiyalari: telegram (webhook), health
scripts/set-webhook.js  Telegram webhook'ni Vercel'ga ulash
src/
  run.js                ishga tushirish (kompyuter — long polling, Render — webhook server)
  webhook-server.js     Render uchun HTTP webhook server
  serverless.js         Vercel rejimi: webhook so'rovini botga uzatish, tiklash
  config.js, db.js
  models/               User, Test, Submission
  lib/rasch.js          Rasch: CML (savollar), WLE (qatnashchilar), moslik statistikalari
  lib/scoring.js        T-ball, daraja, o'rin
  lib/answers.js        kalit/javoblarni o'qish va tekshirish (tutuq, tire, sonlar)
  lib/formats.js        test formatlari (Ona tili — Milliy sertifikat shabloni)
  lib/report.js         Excel hisobot
  services/testService.js
  bot/                  menyular, admin va o'quvchi oqimlari
test/                   unit va oqim testlari
```
