/**
 * 네이버웍스(LINE WORKS) 봇 API 클라이언트
 * 서비스계정 JWT → access token → 봇 메시지 발송.
 *
 * 환경변수:
 *   NAVERWORKS_CLIENT_ID / NAVERWORKS_CLIENT_SECRET
 *   NAVERWORKS_SERVICE_ACCOUNT
 *   NAVERWORKS_PRIVATE_KEY_B64  (RSA private key, base64)
 *   NAVERWORKS_BOT_ID
 *   NAVERWORKS_CHANNEL_ID       (발송 대상 그룹채팅)
 */
import crypto from 'crypto';

const CLIENT_ID = process.env.NAVERWORKS_CLIENT_ID || '';
const CLIENT_SECRET = process.env.NAVERWORKS_CLIENT_SECRET || '';
const SERVICE_ACCOUNT = process.env.NAVERWORKS_SERVICE_ACCOUNT || '';
const BOT_ID = process.env.NAVERWORKS_BOT_ID || '';
const CHANNEL_ID = process.env.NAVERWORKS_CHANNEL_ID || '';
const PRIVATE_KEY = process.env.NAVERWORKS_PRIVATE_KEY_B64
  ? Buffer.from(process.env.NAVERWORKS_PRIVATE_KEY_B64, 'base64').toString('utf8')
  : '';

const AUTH_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token';
const API_BASE = 'https://www.worksapis.com/v1.0';

const b64url = (buf: crypto.BinaryLike) =>
  Buffer.from(buf as Buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function isConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && SERVICE_ACCOUNT && BOT_ID && PRIVATE_KEY);
}
export function hasChannel(): boolean {
  return !!CHANNEL_ID;
}

// ── access token (24h 유효, 모듈 캐시) ──
let cachedToken: { token: string; exp: number } | null = null;

function makeJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: CLIENT_ID, sub: SERVICE_ACCOUNT, iat: now, exp: now + 3600 }));
  const input = `${header}.${payload}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(input), PRIVATE_KEY);
  return `${input}.${b64url(sig)}`;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const body = new URLSearchParams({
    assertion: makeJWT(),
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'bot',
  });
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`네이버웍스 토큰 발급 실패: ${JSON.stringify(json)}`);
  cachedToken = { token: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

// ── 채널(그룹) 메시지 발송 ──
export async function sendChannelMessage(text: string, channelId = CHANNEL_ID): Promise<void> {
  if (!channelId) throw new Error('NAVERWORKS_CHANNEL_ID 미설정');
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/bots/${BOT_ID}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: { type: 'text', text } }),
  });
  if (res.status !== 200 && res.status !== 201) {
    const detail = await res.text();
    throw new Error(`네이버웍스 발송 실패 (HTTP ${res.status}): ${detail}`);
  }
}

// ── 채널 생성 (봇 + 멤버) → channelId 반환 ──
export async function createChannel(title: string, memberIds: string[]): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/bots/${BOT_ID}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, members: memberIds }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.channelId) throw new Error(`채널 생성 실패 (HTTP ${res.status}): ${JSON.stringify(json)}`);
  return json.channelId as string;
}
