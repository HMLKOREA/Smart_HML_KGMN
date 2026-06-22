// 실제 14개 계정을 Supabase Auth 유저로 생성하고 user_profiles를 정합화한다.
// - 기존 테스트 유저/프로필 전부 정리 후 재생성
// - 로그인 이메일 = <loginId 소문자>@smarthml.com, 비밀번호 = 현재 값 유지
// 실행: node scripts/setup-auth-users.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim() || '';
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) { console.error('환경변수 누락'); process.exit(1); }

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 운송사 이름 → transport_companies.id (DB 조회값)
const COMPANY = {
  '강천': '8572e7c8-05da-46a9-9c3b-c9648b471f5f',
  '대경': '00152553-33b4-4cc2-b2ae-a49b250b8650',
  '동방': 'e3106d03-4970-4b44-af64-45a795abb408',
  '성윤': '87183c55-42fe-4c28-9270-92b83331a086',
  '성진': 'c646083c-9ff9-43f9-8189-0eff8c80c98d',
  '우신': 'dbfc43c6-ca1a-4b82-a044-063ee207d7d5',
  '우주': '3da353c5-4067-4649-a4fd-8c2b5a93c2d7',
  '진흥': 'e2fd2ecc-fcfb-4ecd-a1fd-42fae238aa45',
  '태윤': '30d79689-374c-4132-a456-93472e2d82d0',
  '퍼스트': '3857889c-4219-4f51-9a09-f6336de766fe',
};

// loginId, password(현행 유지), name, role, companyName?
const ACCOUNTS = [
  ['ADMIN',    'ADMIN', '관리자',          'admin'],
  ['HMLKOREA', '1111',  '하멜코리아',      'admin'],
  ['KGMNSEL',  '1111',  '경기광업(서울)',  'monitor'],
  ['KGMN',     '12345', '경기광업(금산)',  'field'],
  ['KC', 'KC', '강천',   'transporter', '강천'],
  ['TK', 'TK', '대경',   'transporter', '대경'],
  ['DB', 'DB', '동방',   'transporter', '동방'],
  ['SY', 'SY', '성윤',   'transporter', '성윤'],
  ['SJ', 'SJ', '성진',   'transporter', '성진'],
  ['WS', 'WS', '우신',   'transporter', '우신'],
  ['WJ', 'WJ', '우주',   'transporter', '우주'],
  ['JH', 'JH', '진흥',   'transporter', '진흥'],
  ['TY', 'TY', '태윤',   'transporter', '태윤'],
  ['FS', 'FS', '퍼스트', 'transporter', '퍼스트'],
];

const emailFor = (loginId) => `${loginId.toLowerCase()}@smarthml.com`;

async function main() {
  // 1) 기존 user_profiles 전부 삭제 (더미)
  const { error: delPErr } = await sb.from('user_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('user_profiles 정리:', delPErr ? '실패 ' + delPErr.message : 'OK');

  // 2) 기존 auth 유저 전부 삭제
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of list?.users || []) {
    await sb.auth.admin.deleteUser(u.id);
  }
  console.log('기존 auth 유저 삭제:', (list?.users || []).length, '건');

  // 3) 14개 계정 생성 + 프로필 삽입
  let ok = 0;
  for (const [loginId, password, name, role, companyName] of ACCOUNTS) {
    const email = emailFor(loginId);
    const company_id = companyName ? COMPANY[companyName] : null;
    const { data: created, error: cErr } = await sb.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name, role, login_id: loginId },
    });
    if (cErr) { console.log(`  ❌ ${loginId.padEnd(9)} createUser: ${cErr.message}`); continue; }
    const id = created.user.id;
    const { error: pErr } = await sb.from('user_profiles').insert({
      id, email, username: loginId, name, role,
      company_id, is_active: true,
    });
    if (pErr) { console.log(`  ⚠️ ${loginId.padEnd(9)} profile: ${pErr.message}`); continue; }
    console.log(`  ✅ ${loginId.padEnd(9)} ${role.padEnd(11)} ${name}${company_id ? ' → ' + companyName : ''}`);
    ok++;
  }
  console.log(`\n완료: ${ok}/${ACCOUNTS.length} 계정 생성`);
}
main().catch(e => { console.error(e); process.exit(1); });
