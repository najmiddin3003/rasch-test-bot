import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAnswers,
  parseKeyFixes,
  isOpenCorrect,
  parseClosed,
  parseOpenAnswers,
  parseOpenKey,
  toNumber,
} from '../src/lib/answers.js';

test('yopiq kalit: ketma-ket format', () => {
  assert.deepEqual(parseClosed('abcd ABCD').answers, [...'abcdabcd']);
  assert.deepEqual(parseClosed('a,b,c,d').answers, [...'abcd']);
});

test('yopiq kalit: raqamli format', () => {
  assert.deepEqual(parseClosed('1a2b3c4d').answers, [...'abcd']);
  assert.deepEqual(parseClosed('1-a 2-b 3)c 4.d').answers, [...'abcd']);
  assert.deepEqual(parseClosed('1a 2b 3c 4d 5a 6b 7c 8d 9a 10b 11c').answers.length, 11);
  assert.deepEqual(parseClosed('3c 1a 2b').answers, [...'abc']);
});

test("yopiq kalit: kirill harflar lotinga o'giriladi", () => {
  assert.deepEqual(parseClosed('АВСД').answers, [...'abcd']);
  assert.deepEqual(parseClosed('абсд').answers, [...'abcd']);
});

test('yopiq kalit: xatolar', () => {
  assert.equal(parseClosed('abcz').ok, false);
  assert.equal(parseClosed('').ok, false);
  assert.match(parseClosed('1a2b4d').error, /3/);
  assert.match(parseClosed('1a1b').error, /ikki marta/);
});

test("o'quvchi javobi: soni tekshiriladi, x — javobsiz", () => {
  assert.equal(parseClosed('abc', { expected: 4, allowSkip: true }).ok, false);
  assert.deepEqual(parseClosed('abxd', { expected: 4, allowSkip: true }).answers, ['a', 'b', '', 'd']);
  assert.deepEqual(parseClosed('ab-d', { expected: 4, allowSkip: true }).answers, ['a', 'b', '', 'd']);
  assert.deepEqual(parseClosed('1a2b3x4d', { expected: 4, allowSkip: true }).answers, ['a', 'b', '', 'd']);
  assert.match(parseClosed('1a2b3c4d5a', { expected: 4, allowSkip: true }).error, /5/);
  assert.equal(parseClosed('abxd').ok, false, 'admin kalitida x mumkin emas');
});

test('ochiq kalit: raqamli va raqamsiz', () => {
  const labeled = parseOpenKey('36a=12\n36b) -3\n37 = 0.5;1/2', 35);
  assert.ok(labeled.ok);
  assert.deepEqual(labeled.items, [
    { label: '36a', key: ['12'] },
    { label: '36b', key: ['-3'] },
    { label: '37', key: ['0.5', '1/2'] },
  ]);
  const plain = parseOpenKey('12\n-3\n1.5', 35);
  assert.deepEqual(
    plain.items.map((i) => i.label),
    ['36', '37', '38'],
  );
  assert.deepEqual(plain.items[2].key, ['1.5']);
});

test('ochiq kalit: xatolar', () => {
  assert.equal(parseOpenKey('36a=12\n5', 35).ok, false, 'aralash format');
  assert.equal(parseOpenKey('36=1\n36=2', 35).ok, false, 'takror');
  assert.equal(parseOpenKey('30=1', 35).ok, false, 'yopiq raqam bilan to\'qnashuv');
});

test("o'quvchi ochiq javoblari", () => {
  const labels = ['36a', '36b', '37'];
  assert.deepEqual(parseOpenAnswers('12\n-3\n1/2', labels).answers, ['12', '-3', '1/2']);
  assert.deepEqual(parseOpenAnswers('36b=4\n37=-\n36a=1', labels).answers, ['1', '4', '']);
  assert.deepEqual(parseOpenAnswers('36а=1\n36б=4\n37=5', labels).answers, ['1', '4', '5'], 'kirill a/б');
  assert.equal(parseOpenAnswers('12\n-3', labels).ok, false);
  assert.equal(parseOpenAnswers('36a=1\n36b=2', labels).ok, false);
});

test('ochiq javoblarni solishtirish', () => {
  assert.ok(isOpenCorrect('0,5', ['0.5']));
  assert.ok(isOpenCorrect('1/2', ['0.5']));
  assert.ok(isOpenCorrect('.5', ['1/2']));
  assert.ok(isOpenCorrect(' -3 ', ['−3']));
  assert.ok(isOpenCorrect('+4', ['4']));
  assert.ok(isOpenCorrect('X = 5', ['x=5']));
  assert.ok(isOpenCorrect('Toshkent', ['toshkent']));
  assert.ok(!isOpenCorrect('', ['0']));
  assert.ok(!isOpenCorrect('3', ['4']));
  assert.equal(toNumber('2/0'), null);
  assert.equal(toNumber('abc'), null);
});

test('checkAnswers', () => {
  const items = [
    { kind: 'closed', key: ['a'] },
    { kind: 'closed', key: ['b'] },
    { kind: 'open', key: ['0.5', '1/2'] },
    { kind: 'open', key: ['12'] },
  ];
  assert.deepEqual(checkAnswers(items, ['a', 'c', '2/4', '']), [1, 0, 1, 0]);
});

test('kalitni tuzatish parseri', () => {
  const items = [
    { label: '7', kind: 'closed' },
    { label: '31a', kind: 'open' },
  ];
  const ok = parseKeyFixes('7=C\n31а = 12;12.0', items);
  assert.ok(ok.ok);
  assert.deepEqual([...ok.fixes.entries()], [
    ['7', ['c']],
    ['31a', ['12', '12.0']],
  ]);
  assert.match(parseKeyFixes('8=c', items).error, /yo'q/);
  assert.match(parseKeyFixes('7=cd', items).error, /bitta harf/);
  assert.equal(parseKeyFixes('salom', items).ok, false);
});

test("xato matnlarida foydalanuvchi kiritgan < va & bo'lishi mumkin (HTML escape talab qilinadi)", () => {
  const err = parseClosed('1a 2b <3c', { expected: 3, allowSkip: true }).error;
  assert.ok(err.includes('<'), 'xato matni xom kiritmani o\'z ichiga oladi — botda escapeHtml shart');
});
