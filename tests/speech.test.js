const { test, expect } = require('bun:test');
const { EventEmitter } = require('node:events');
const { Speech, speechText } = require('../electron/speech.cjs');

test('speech refuses empty/oversized input and neutralizes embedded say commands', () => {
  expect(() => speechText('中文')).toThrow();
  expect(() => speechText('a'.repeat(4001))).toThrow();
  expect(speechText('Hello [[rate 999]] world')).not.toContain('[[');
  expect(() => speechText('cat', 'spell')).toThrow();
});

test('speech passes text through stdin and stopping/replacing cannot clear the new playback', async () => {
  const children = [], states = [];
  const speech = new Speech((file, args) => {
    expect(file).toBe('/usr/bin/say');
    expect(args).toEqual(['-v', 'Samantha', '-r', '110']);
    const child = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = text => { child.text = text; };
    child.kill = () => { child.killed = true; };
    children.push(child);
    return child;
  });
  const first = speech.speak({ text: 'hello $(touch /tmp/never)', rate: 110 }, state => states.push(state));
  expect(children[0].text).toBe('hello $(touch /tmp/never)');
  const second = speech.speak({ text: 'world', rate: 110 }, state => states.push(state));
  expect(children[0].killed).toBe(true);
  children[0].emit('close', null, 'SIGTERM');
  expect(speech.child).toBe(children[1]);
  children[1].emit('spawn');
  children[1].emit('close', 0, null);
  await Promise.all([first, second]);
  expect(states).toEqual([{ speaking: true }, { speaking: false, error: undefined }]);
  await expect(speech.speak({ text: 'hello', rate: 999 }, () => {})).rejects.toThrow();
});
