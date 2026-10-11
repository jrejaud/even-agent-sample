import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, fitToLens, lastUserText } from '../server.mjs';

async function withServer(opts, fn) {
  const server = createServer({ token: 'secret', ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  try { await fn(url); } finally { server.close(); }
}
const post = (url, text, token = 'secret') =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: text }] }),
  });

test('rejects a wrong token', async () => {
  await withServer({ backend: async () => 'x' }, async (url) => {
    assert.equal((await post(url, 'hi', 'nope')).status, 401);
  });
});

test('answers in the OpenAI chat-completions shape', async () => {
  await withServer({ backend: async (t) => `echo ${t}` }, async (url) => {
    const res = await post(url, 'what time is it');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.object, 'chat.completion');
    assert.equal(body.choices[0].message.role, 'assistant');
    assert.equal(body.choices[0].message.content, 'echo what time is it');
    assert.equal(body.choices[0].finish_reason, 'stop');
  });
});

test('the twin request the app fires gets one backend call and the same answer', async () => {
  let calls = 0;
  const backend = async (t) => { calls++; await new Promise((r) => setTimeout(r, 50)); return `answer ${calls}`; };
  await withServer({ backend }, async (url) => {
    const [a, b] = await Promise.all([post(url, 'twin'), post(url, 'twin')]);
    const [ja, jb] = [await a.json(), await b.json()];
    assert.equal(calls, 1);
    assert.equal(ja.choices[0].message.content, jb.choices[0].message.content);
  });
});

test('a slow backend gets a holding reply instead of a hang-up', async () => {
  await withServer({ backend: () => new Promise(() => {}), replyTimeoutMs: 80 }, async (url) => {
    const body = await (await post(url, 'slow')).json();
    assert.match(body.choices[0].message.content, /Still working/);
  });
});

test('a backend error becomes a short spoken error', async () => {
  await withServer({ backend: async () => { throw new Error('boom'); } }, async (url) => {
    const body = await (await post(url, 'x')).json();
    assert.match(body.choices[0].message.content, /error/);
  });
});

test('fitToLens strips markdown and cuts on a sentence boundary', () => {
  assert.equal(fitToLens('**Bold** and `code` [link](http://x)'), 'Bold and code link');
  const long = 'First sentence here. '.repeat(40);
  const out = fitToLens(long, 100);
  assert.ok(out.length <= 100);
  assert.ok(out.endsWith('.'));
});

test('lastUserText takes the last user message, including part arrays', () => {
  assert.equal(lastUserText({ messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }] }), 'b');
  assert.equal(lastUserText({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }), 'hi');
  assert.equal(lastUserText({}), '');
});

test('a slow answer is returned when the same question is asked again', async () => {
  let release;
  const backend = () => new Promise((r) => { release = () => r('The real answer.'); });
  await withServer({ backend, replyTimeoutMs: 40, dedupeWindowMs: 10 }, async (url) => {
    const first = await (await post(url, 'long one')).json();
    assert.match(first.choices[0].message.content, /Still working/);
    release();
    await new Promise((r) => setTimeout(r, 30));
    const second = await (await post(url, 'long one')).json();
    assert.equal(second.choices[0].message.content, 'The real answer.');
  });
});
