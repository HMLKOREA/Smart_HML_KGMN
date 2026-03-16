import type { UserRole } from '@/types';

export interface HardcodedAccount {
  loginId: string;       // 대문자 저장 (ADMIN, FS 등)
  password: string;      // 대문자 저장
  name: string;          // 표시명
  role: UserRole;
  companyName?: string;  // 운송사 계정: transport_companies.name 매칭
  email?: string;
  phone?: string;
}

export const ACCOUNTS: HardcodedAccount[] = [
  // ── 관리자 (admin) ──
  { loginId: 'ADMIN',    password: 'ADMIN',  name: '관리자',         role: 'admin',   email: 'kgmn@hmlkorea.com' },
  { loginId: 'HMLKOREA', password: '1111',   name: '하멜코리아',     role: 'admin',   email: 'kgmn@hmlkorea.com' },

  // ── 모니터링 (monitor) ──
  { loginId: 'KGMNSEL',  password: '1111',   name: '경기광업 (서울)', role: 'monitor' },

  // ── 현장 - 제한된 관리자 (field) ──
  { loginId: 'KGMN',     password: '12345',  name: '경기광업 (금산)', role: 'field' },

  // ── 운송사 (transporter) ──
  { loginId: 'KC', password: 'KC', name: '강천',   role: 'transporter', companyName: '강천',   email: 'han873111@naver.com',     phone: '010-4219-2244' },
  { loginId: 'TK', password: 'TK', name: '대경',   role: 'transporter', companyName: '대경',   email: 'dydvlfl1283@naver.com',   phone: '010-9456-9988' },
  { loginId: 'DB', password: 'DB', name: '동방',   role: 'transporter', companyName: '동방',   email: 'hwkim@dongbang.co.kr',    phone: '010-9138-0775' },
  { loginId: 'SY', password: 'SY', name: '성윤',   role: 'transporter', companyName: '성윤',                                     phone: '010-6500-1101' },
  { loginId: 'SJ', password: 'SJ', name: '성진',   role: 'transporter', companyName: '성진',   email: 'sung2872@daum.net',       phone: '010-3675-2872' },
  { loginId: 'WS', password: 'WS', name: '우신',   role: 'transporter', companyName: '우신',   email: 'wsts6663@nate.com' },
  { loginId: 'WJ', password: 'WJ', name: '우주',   role: 'transporter', companyName: '우주',   email: 'ouju4667@hanmail.net',    phone: '010-5483-4667' },
  { loginId: 'JH', password: 'JH', name: '진흥',   role: 'transporter', companyName: '진흥',   email: 'jh0193@hanmail.net',      phone: '010-3673-0193' },
  { loginId: 'TY', password: 'TY', name: '태윤',   role: 'transporter', companyName: '태윤',   email: 'kdj879@hanmail.net',      phone: '010-3471-0267' },
  { loginId: 'FS', password: 'FS', name: '퍼스트', role: 'transporter', companyName: '퍼스트', email: 'firstinc@hanmail.net',    phone: '010-6259-8393' },
];

/**
 * 대소문자 구분 없이 ID/PW 검증
 */
export function validateCredentials(loginId: string, password: string): HardcodedAccount | null {
  const id = loginId.trim().toUpperCase();
  const pw = password.trim().toUpperCase();
  return ACCOUNTS.find(a => a.loginId === id && a.password === pw) || null;
}

/**
 * loginId로 계정 정보 조회
 */
export function getAccountByLoginId(loginId: string): HardcodedAccount | null {
  const id = loginId.trim().toUpperCase();
  return ACCOUNTS.find(a => a.loginId === id) || null;
}

/**
 * 운송사 계정 목록만 조회
 */
export function getTransporterAccounts(): HardcodedAccount[] {
  return ACCOUNTS.filter(a => a.role === 'transporter');
}
