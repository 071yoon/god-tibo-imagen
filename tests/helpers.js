import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

export async function makeTempDir(prefix = 'codex-imagegen-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function toBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function makeJwt(payload = {}) {
  return `${toBase64Url({ alg: 'none', typ: 'JWT' })}.${toBase64Url(payload)}.sig`;
}

export async function writeAuthFixture(dir, { accessExpOffsetSeconds = 3600, accountId = 'acct-123' } = {}) {
  const authPath = path.join(dir, 'auth.json');
  const installationIdPath = path.join(dir, 'installation_id');
  const accessToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + accessExpOffsetSeconds });
  const idToken = makeJwt({
    'https://api.openai.com/auth': {
      chatgpt_account_id: accountId,
      chatgpt_plan_type: 'plus'
    }
  });

  const auth = {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    last_refresh: new Date().toISOString(),
    tokens: {
      access_token: accessToken,
      account_id: accountId,
      id_token: idToken,
      refresh_token: 'refresh-token'
    }
  };

  await fs.writeFile(authPath, JSON.stringify(auth, null, 2));
  await fs.writeFile(installationIdPath, 'install-123');
  return { authPath, installationIdPath, accessToken, accountId };
}

export function createFetchResponse({ ok = true, status = 200, body = '', headers = {} } = {}) {
  const map = new Map(Object.entries(headers));
  return {
    ok,
    status,
    headers: {
      get(name) {
        return map.get(name.toLowerCase()) ?? map.get(name) ?? null;
      },
      entries() {
        return map.entries();
      }
    },
    async text() {
      return body;
    }
  };
}
