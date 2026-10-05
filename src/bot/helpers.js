import { mainMenu } from './keyboards.js';
import { HTML } from './texts.js';

export async function setState(ctx, state, data = {}) {
  ctx.user.state = state;
  ctx.user.stateData = data;
  await ctx.user.save();
}

export async function resetState(ctx) {
  if (ctx.user.state === null && !Object.keys(ctx.user.stateData || {}).length) return;
  await setState(ctx, null, {});
}

export function replyWithMenu(ctx, text) {
  return ctx.reply(text, { ...HTML, reply_markup: mainMenu(ctx.isAdmin), link_preview_options: { is_disabled: true } });
}

/** Xabarni tahrirlash; "message is not modified" xatosini e'tiborsiz qoldiradi */
export async function safeEdit(ctx, text, extra = {}) {
  try {
    await ctx.editMessageText(text, { ...HTML, link_preview_options: { is_disabled: true }, ...extra });
  } catch (err) {
    if (!String(err?.description || err?.message).includes('message is not modified')) throw err;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
