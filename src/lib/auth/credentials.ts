import type { UserRole } from '@/types';

export interface HardcodedAccount {
  loginId: string;       // 대문자 저장 (ADMIN, FS 등)
  password: string;      // 대문자 저장
  name: string;          // 표시명
  role: UserRole;
  companyName?: string;  // 운송사 계정: transport_companies.name 매칭
}

export const ACCOUNTS: HardcodedAccount[] = [
  // ── 관리자 (admin) ──
  { loginId: 'ADMIN',    password: 'ADMIN',  name: '관리자',      role: 'admin' },
  { loginId: 'HMLKOREA', password: '1111',   name: '하멜코리아',   role: 'admin' },
  { loginId: 'KGMN',     password: '12345',  name: '경기광업',     role: 'admin' },

  // ── 모니터링 (monitor) ──
  { loginId: 'KGMNGS',   password: '1111',   name: '경기광업(서울)', role: 'monitor' },

  // ── 운송사 (transporter) ──
  { loginId: 'FS', password: 'FS', name: '퍼스트', role: 'transporter', companyName: '퍼스트' },
  { loginId: 'SJ', password: 'SJ', name: '성진',   role: 'transporter', companyName: '성진' },
  { loginId: 'TK', password: 'TK', name: '대경',   role: 'transporter', companyName: '대경' },
  { loginId: 'KC', password: 'KC', name: '강천',   role: 'transporter', companyName: '강천' },
  { loginId: 'WJ', password: 'WJ', name: '우주',   role: 'transporter', companyName: '우주' },
  { loginId: 'SY', password: 'SY', name: '성윤',   role: 'transporter', companyName: '성윤' },
  { loginId: 'WS', password: 'WS', name: '우신',   role: 'transporter', companyName: '우신' },
  { loginId: 'TY', password: 'TY', name: '태윤',   role: 'transporter', companyName: '태윤' },
  { loginId: 'DB', password: 'DB', name: '동방',   role: 'transporter', companyName: '동방' },
  { loginId: 'SC', password: 'SC', name: '상차도', role: 'transporter', companyName: '상차도' },
  { loginId: 'JH', password: 'JH', name: '진흥',   role: 'transporter', companyName: '진흥' },
];

/**
 * 대소문자 구분 없이 ID/PW 검증
 */
export function validateCredentials(loginId: string, password: string): HardcodedAccount | null {
  const id = loginId.trim().toUpperCase();
  const pw = password.trim().toUpperCase();
  return ACCOUNTS.find(a => a.loginId === id && a.password === pw) || null;
}
