import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoomServer } from '../apps/web/hosting.js';

test('room server configuration accepts HTTPS origins and loopback development only', () => {
  assert.equal(validateRoomServer('https://tables.example.org/'), 'https://tables.example.org');
  assert.equal(validateRoomServer('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  for (const input of ['', undefined, 'javascript:alert(1)', '//evil.example', 'http://tables.example.org', 'https://user:secret@tables.example.org', 'https://tables.example.org/path', 'https://tables.example.org/?secret=1', 'https://tables.example.org/#/join']) {
    assert.equal(validateRoomServer(input), null);
  }
});
