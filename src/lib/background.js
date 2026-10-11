// Javob qaytgandan keyin ham davom etadigan ishlar (masalan, natijalarni yuborish).
// Oddiy serverda (Render, kompyuter) jarayon ishlab turaveradi; Vercel'da esa funksiya javobdan
// keyin to'xtatilishi mumkin — shuning uchun bunday ishlar waitUntil bilan ro'yxatdan o'tkaziladi.
let runner = null;

/** @param {(promise: Promise<unknown>) => void} fn masalan, @vercel/functions dagi waitUntil */
export function setBackgroundRunner(fn) {
  runner = fn;
}

export function runInBackground(promise) {
  runner?.(promise);
  return promise;
}
