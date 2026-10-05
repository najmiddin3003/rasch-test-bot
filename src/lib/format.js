export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "05.10.2026 14:30" (Toshkent vaqti) */
export function formatDate(date) {
  if (!date) return '—';
  const parts = Object.fromEntries(dateFmt.formatToParts(new Date(date)).map((p) => [p.type, p.value]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

/** Yopiq javoblarni 10 talab guruhlab ko'rsatish: "1–10: abcd..." */
export function formatClosedBlock(letters) {
  const lines = [];
  for (let i = 0; i < letters.length; i += 10) {
    const chunk = letters.slice(i, i + 10).map((l) => (l ? l.toUpperCase() : '–'));
    const end = Math.min(i + 10, letters.length);
    lines.push(`<code>${String(i + 1).padStart(2, ' ')}–${String(end).padEnd(2, ' ')}: ${chunk.join(' ')}</code>`);
  }
  return lines.join('\n');
}

export function formatOpenBlock(labels, values) {
  return labels.map((l, i) => `<code>${l}:</code> ${escapeHtml(values[i] || '–')}`).join('\n');
}

export function formatNumber(v, digits = 1) {
  return v === null || v === undefined ? '—' : Number(v).toFixed(digits);
}
