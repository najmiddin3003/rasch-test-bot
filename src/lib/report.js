import ExcelJS from 'exceljs';
import { formatDate } from './format.js';
import { formatTitle, itemOptions, optionRange } from './formats.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

function methodName(method) {
  return (
    {
      CML: 'Rasch: savollar — CML, qatnashchilar — WLE (Warm)',
      'CML+prior': 'Rasch: savollar — CML + zaif prior N(0, 3²) (Guttman shaklidagi ma‘lumot), qatnashchilar — WLE',
      logit: 'Taxminiy (ma‘lumot juda kam): savollar — ulush logiti, qatnashchilar — WLE',
    }[method] ?? '—'
  );
}

/** Ogohlantirish bo'lmagan, lekin bilish foydali holatlar (sariq rang bilan belgilanmaydi) */
function infoNote(item, participants) {
  if (!participants || item.correctCount === null || item.correctCount === undefined) return '';
  if (item.correctCount === participants) return "Hamma to'g'ri topgan (ma'lumot uchun)";
  if (item.correctCount === 0) return "Hech kim to'g'ri topmagan (ma'lumot uchun)";
  return '';
}

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 30;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Yopilgan test bo'yicha Excel hisobot.
 * @param {import('../models/Test.js').Test} test
 * @param {Array} submissions rank bo'yicha saralangan
 * @returns {Promise<Buffer>}
 */
export async function buildExcelReport(test, submissions) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rasch Test Bot';
  wb.created = new Date();
  const total = test.items.length;

  // 1. Natijalar
  const results = wb.addWorksheet('Natijalar');
  results.columns = [
    { header: "O'rin", key: 'rank', width: 7 },
    { header: 'Ism-familiya', key: 'fullName', width: 32 },
    { header: 'Username', key: 'username', width: 18 },
    { header: 'Telegram ID', key: 'userId', width: 14 },
    { header: "To'g'ri", key: 'raw', width: 9 },
    { header: 'Foiz', key: 'percent', width: 8 },
    { header: 'θ (logit)', key: 'theta', width: 10 },
    { header: 'SE', key: 'se', width: 8 },
    { header: test.hasEssay ? 'Test bali (T)' : 'T-ball', key: 'tScore', width: 9 },
    ...(test.hasEssay
      ? [
          { header: 'Esse', key: 'essay', width: 8 },
          { header: 'Umumiy ball', key: 'totalScore', width: 10 },
        ]
      : []),
    { header: 'Daraja', key: 'grade', width: 9 },
    { header: 'Infit', key: 'infit', width: 7 },
    { header: 'Outfit', key: 'outfit', width: 7 },
    { header: 'Topshirgan vaqti', key: 'createdAt', width: 18 },
  ];
  for (const s of submissions) {
    results.addRow({
      rank: s.rank,
      fullName: s.fullName,
      username: s.username ? `@${s.username}` : '',
      userId: s.simulated ? 'sinov' : s.userId,
      raw: `${s.rawScore}/${total}`,
      percent: total ? Math.round((s.rawScore / total) * 1000) / 10 : 0,
      theta: s.theta,
      se: s.se,
      tScore: s.tScore,
      essay: s.essaySkipped ? '0 (kiritilmagan)' : s.essay,
      totalScore: s.totalScore,
      grade: s.grade || "O'tmadi",
      infit: s.infit,
      outfit: s.outfit,
      createdAt: formatDate(s.createdAt),
    });
  }
  styleHeader(results);

  // 2. Savollar tahlili
  const itemsSheet = wb.addWorksheet('Savollar');
  itemsSheet.columns = [
    { header: 'Savol', key: 'label', width: 8 },
    { header: 'Turi', key: 'kind', width: 12 },
    { header: 'Kalit', key: 'key', width: 16 },
    { header: "To'g'ri yechganlar", key: 'correct', width: 12 },
    { header: 'Foiz', key: 'percent', width: 8 },
    { header: 'Qiyinlik (logit)', key: 'difficulty', width: 12 },
    { header: 'SE', key: 'se', width: 8 },
    { header: 'Infit', key: 'infit', width: 7 },
    { header: 'Outfit', key: 'outfit', width: 7 },
    { header: 'Pt-biserial', key: 'ptBiserial', width: 10 },
    { header: 'Izoh', key: 'flag', width: 60 },
  ];
  const n = submissions.length;
  for (const item of test.items) {
    const row = itemsSheet.addRow({
      label: item.label,
      kind: item.kind === 'closed' ? `yopiq (${optionRange(itemOptions(item))})` : 'yozma',
      key: item.kind === 'closed' ? item.key[0].toUpperCase() : item.key.join(' ; '),
      correct: item.correctCount,
      percent: n ? Math.round((item.correctCount / n) * 1000) / 10 : 0,
      difficulty: item.difficulty,
      se: item.se,
      infit: item.infit,
      outfit: item.outfit,
      ptBiserial: item.ptBiserial,
      flag: item.flag || infoNote(item, n),
    });
    if (item.flag) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
  }
  styleHeader(itemsSheet);

  // 3. Javoblar matritsasi (1/0)
  const matrix = wb.addWorksheet('Matritsa');
  matrix.columns = [
    { header: 'Ism-familiya', key: 'fullName', width: 28 },
    ...test.items.map((item, i) => ({ header: item.label, key: `i${i}`, width: 5 })),
    { header: 'Jami', key: 'raw', width: 7 },
  ];
  for (const s of submissions) {
    const row = { fullName: s.fullName, raw: s.rawScore };
    s.correct.forEach((c, i) => {
      row[`i${i}`] = c;
    });
    const added = matrix.addRow(row);
    s.correct.forEach((c, i) => {
      added.getCell(i + 2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: c ? 'FFC6EFCE' : 'FFFFC7CE' },
      };
    });
  }
  styleHeader(matrix);

  // 4. Ma'lumot
  const info = wb.addWorksheet("Ma'lumot");
  info.columns = [
    { header: "Ko'rsatkich", key: 'k', width: 28 },
    { header: 'Qiymat', key: 'v', width: 40 },
  ];
  info.addRows([
    { k: 'Test nomi', v: test.name },
    { k: 'Kod', v: test.code },
    { k: 'Format', v: formatTitle(test.format) },
    { k: 'Savollar soni', v: total },
    { k: 'Esse', v: test.hasEssay ? "bor — umumiy ball = (test bali + esse bali) / 2" : "yo'q" },
    { k: 'Qatnashchilar', v: n },
    { k: 'Yopilgan vaqti', v: formatDate(test.closedAt) },
    ...(test.revision ? [{ k: 'Natija yuborilgandan keyin kalit tuzatilgan', v: `${test.revision} marta` }] : []),
    { k: 'O‘rtacha θ', v: test.stats?.meanTheta },
    { k: 'θ standart og‘ishi', v: test.stats?.sdTheta },
    { k: 'Baholash usuli', v: methodName(test.stats?.method) },
    { k: 'Iteratsiyalar', v: test.stats?.iterations },
    { k: 'Yaqinlashdi', v: test.stats?.converged ? 'ha' : "yo'q" },
    { k: 'Ishonchlilik (Rasch)', v: test.stats?.reliability },
    { k: 'KR-20', v: test.stats?.kr20 },
    { k: 'Formula', v: 'T = 50 + 10·(θ − o‘rtacha) / SD (SD — tanlanma, n−1), [0; 75] oralig‘ida' },
    { k: 'Darajalar', v: 'A+ ≥70, A ≥65, B+ ≥60, B ≥55, C+ ≥50, C ≥46' },
    { k: 'Eslatma', v: 'Ball shu test qatnashchilariga nisbatan standartlashtiriladi (o‘rtacha = 50).' },
  ]);
  styleHeader(info);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
