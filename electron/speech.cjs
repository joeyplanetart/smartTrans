const { spawn } = require('node:child_process');

function speechText(text, mode = 'read') {
  if (typeof text !== 'string' || text.length > 4000) throw new Error('请选择 4000 字符以内的英文单词或短句。');
  if (!/[a-z]/i.test(text)) throw new Error('请先选中英文单词或短句。');
  // say supports embedded commands; never interpret commands supplied by content.
  const clean = text.replace(/\[\[/g, '').replace(/\]\]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim();
  if (mode !== 'read') throw new Error('无效的朗读模式。');
  return clean;
}
class Speech {
  constructor(start = spawn) { this.start = start; this.child = null; }
  stop() { const child = this.child; this.child = null; child?.kill(); }
  async speak(payload, onState) {
    const text = speechText(payload?.text, payload?.mode);
    const rate = Number(payload?.rate ?? 170);
    if (![110, 170, 210].includes(rate)) throw new Error('无效的语速。');
    this.stop();
    const child = this.start('/usr/bin/say', ['-v', 'Samantha', '-r', String(rate)], { stdio: ['pipe', 'ignore', 'ignore'] });
    this.child = child;
    return new Promise(resolve => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        if (this.child === child) { this.child = null; onState({ speaking: false, error }); }
        resolve(error ? { ok: false, error } : { ok: true });
      };
      child.once('error', () => finish('系统语音启动失败，请检查 macOS 英语语音 Samantha 是否可用。'));
      child.once('close', (code, signal) => finish(code === 0 || signal ? undefined : '朗读失败，请在 macOS 系统设置中检查英语语音 Samantha。'));
      child.stdin.on('error', () => {});
      child.once('spawn', () => { if (this.child === child) onState({ speaking: true }); });
      child.stdin.end(text);
    });
  }
}
module.exports = { Speech, speechText };
