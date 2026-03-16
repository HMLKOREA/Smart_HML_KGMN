'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import type { UserRole } from '@/types';
import { getSession } from '@/lib/auth/session';

// ── 사용자 데이터 타입 ──
interface UserData {
  no: number;
  name: string;
  category: string;         // 분류
  role: UserRole;           // 시스템 역할
  permission: string;       // 권한 설명
  loginId: string;          // ID
  password: string;         // PS
  email: string;
  phone: string;
  isActive: boolean;
}

// ── 14명 사용자 데이터 (순서 고정) ──
const INITIAL_USERS: UserData[] = [
  { no: 1,  name: '관리자',           category: '관리자',           role: 'admin',       permission: '관리자',                              loginId: 'admin',    password: 'admin',  email: 'kgmn@hmlkorea.com',         phone: '',               isActive: true },
  { no: 2,  name: '하멜코리아',       category: '관리자',           role: 'admin',       permission: '관리자',                              loginId: 'hmlkorea', password: '1111',   email: 'kgmn@hmlkorea.com',         phone: '',               isActive: true },
  { no: 3,  name: '경기광업 (서울)',   category: '모니터링',         role: 'monitor',     permission: '모니터링',                            loginId: 'kgmnsel',  password: '1111',   email: '',                           phone: '',               isActive: true },
  { no: 4,  name: '경기광업 (금산)',   category: '관리자, 제한',     role: 'field',       permission: '출하관리 수정, 나머지메뉴는 모니터링', loginId: 'kgmn',     password: '12345',  email: '',                           phone: '',               isActive: true },
  { no: 5,  name: '강천',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'KC',       password: 'KC',     email: 'han873111@naver.com',        phone: '010-4219-2244',  isActive: true },
  { no: 6,  name: '대경',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'TK',       password: 'TK',     email: 'dydvlfl1283@naver.com',      phone: '010-9456-9988',  isActive: true },
  { no: 7,  name: '동방',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'DB',       password: 'DB',     email: 'hwkim@dongbang.co.kr',       phone: '010-9138-0775',  isActive: true },
  { no: 8,  name: '성윤',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'SY',       password: 'SY',     email: '',                           phone: '010-6500-1101',  isActive: true },
  { no: 9,  name: '성진',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'SJ',       password: 'SJ',     email: 'sung2872@daum.net',          phone: '010-3675-2872',  isActive: true },
  { no: 10, name: '우신',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'WS',       password: 'WS',     email: 'wsts6663@nate.com',          phone: '',               isActive: true },
  { no: 11, name: '우주',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'WJ',       password: 'WJ',     email: 'ouju4667@hanmail.net',       phone: '010-5483-4667',  isActive: true },
  { no: 12, name: '진흥',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'JH',       password: 'JH',     email: 'jh0193@hanmail.net',         phone: '010-3673-0193',  isActive: true },
  { no: 13, name: '태윤',             category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'TY',       password: 'TY',     email: 'kdj879@hanmail.net',         phone: '010-3471-0267',  isActive: true },
  { no: 14, name: '퍼스트',           category: '운송사',           role: 'transporter', permission: '운송사',                              loginId: 'FS',       password: 'FS',     email: 'firstinc@hanmail.net',       phone: '010-6259-8393',  isActive: true },
];

const CATEGORY_COLORS: Record<string, string> = {
  '관리자':       '#dc2626',
  '모니터링':     '#2563eb',
  '관리자, 제한': '#d97706',
  '운송사':       '#16a34a',
};

const CATEGORY_BG: Record<string, string> = {
  '관리자':       '#fef2f2',
  '모니터링':     '#eff6ff',
  '관리자, 제한': '#fffbeb',
  '운송사':       '#f0fdf4',
};

export default function UserManagementPage() {
  const { isAdmin, isTransporter, profile } = useAuth();
  const session = getSession();
  const currentLoginId = session?.loginId?.toUpperCase() || '';

  const [users, setUsers] = useState<UserData[]>(INITIAL_USERS);
  const [showModal, setShowModal] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState<Record<number, boolean>>({});
  const [formData, setFormData] = useState<UserData>({
    no: 0, name: '', category: '운송사', role: 'transporter', permission: '운송사',
    loginId: '', password: '', email: '', phone: '', isActive: true,
  });
  const [error, setError] = useState('');

  // 운송사는 자기 정보만 볼 수 있음
  const visibleUsers = isTransporter
    ? users.filter(u => u.loginId.toUpperCase() === currentLoginId)
    : users;
  const isSelfOnly = isTransporter; // 운송사는 자기 정보만 수정 가능

  if (!isAdmin && !isTransporter) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <p style={{ color: '#9ca3af', fontSize: 15 }}>관리자 권한이 필요합니다.</p>
      </div>
    );
  }

  const handleNew = () => {
    setEditingIdx(null);
    setFormData({
      no: users.length + 1,
      name: '', category: '운송사', role: 'transporter', permission: '운송사',
      loginId: '', password: '', email: '', phone: '', isActive: true,
    });
    setError('');
    setShowModal(true);
  };

  const handleEdit = (idx: number) => {
    setEditingIdx(idx);
    setFormData({ ...users[idx] });
    setError('');
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.loginId) {
      setError('이름과 ID는 필수입니다.');
      return;
    }
    // 역할 자동 매핑
    let role: UserRole = 'transporter';
    if (formData.category === '관리자') role = 'admin';
    else if (formData.category === '모니터링') role = 'monitor';
    else if (formData.category === '관리자, 제한') role = 'field';

    const updated = { ...formData, role };

    if (editingIdx !== null) {
      const newUsers = [...users];
      newUsers[editingIdx] = updated;
      setUsers(newUsers);
    } else {
      setUsers([...users, updated]);
    }
    setShowModal(false);
  };

  const handleToggleActive = (idx: number) => {
    const newUsers = [...users];
    newUsers[idx] = { ...newUsers[idx], isActive: !newUsers[idx].isActive };
    setUsers(newUsers);
  };

  const togglePw = (no: number) => {
    setShowPassword(prev => ({ ...prev, [no]: !prev[no] }));
  };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 22, background: '#2563eb', borderRadius: 2 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>사용자 관리</h2>
          <span style={{
            fontSize: 12, color: '#64748b', background: '#f1f5f9',
            padding: '2px 10px', borderRadius: 10, marginLeft: 4,
          }}>
            {isSelfOnly ? '내 정보' : `총 ${users.length}명`}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={handleNew}
            style={{
              padding: '8px 18px', background: '#2563eb', color: '#fff',
              fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 8,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 4v16m8-8H4" />
            </svg>
            신규 사용자
          </button>
        )}
      </div>

      {/* ── 사용자 테이블 ── */}
      <div style={{
        background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['No', '이름', '분류', '권한', 'ID', 'PW', '이메일', '연락처', '상태', '관리'].map((h, i) => (
                  <th key={h} style={{
                    padding: '10px 12px',
                    fontSize: 13, fontWeight: 700, color: '#475569',
                    textAlign: i === 0 ? 'center' : 'left',
                    whiteSpace: 'nowrap',
                    borderBottom: '2px solid #e2e8f0',
                    ...(i === 0 ? { width: 50 } : {}),
                    ...(h === 'PW' ? { width: 100 } : {}),
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user, idx) => (
                <tr
                  key={user.no}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: !user.isActive ? '#fafafa' : (idx % 2 === 0 ? '#fff' : '#fafcff'),
                    opacity: user.isActive ? 1 : 0.5,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (user.isActive) e.currentTarget.style.background = '#f0f4ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = !user.isActive ? '#fafafa' : (idx % 2 === 0 ? '#fff' : '#fafcff'); }}
                >
                  {/* No */}
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
                    {user.no}
                  </td>
                  {/* 이름 */}
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b', fontSize: 14, whiteSpace: 'nowrap' }}>
                    {user.name}
                  </td>
                  {/* 분류 */}
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 10px', borderRadius: 6,
                      fontSize: 12, fontWeight: 600,
                      color: CATEGORY_COLORS[user.category] || '#475569',
                      background: CATEGORY_BG[user.category] || '#f1f5f9',
                      border: `1px solid ${(CATEGORY_COLORS[user.category] || '#cbd5e1') + '30'}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {user.category}
                    </span>
                  </td>
                  {/* 권한 */}
                  <td style={{ padding: '9px 12px', fontSize: 13, color: '#475569', maxWidth: 240 }}>
                    {user.permission}
                  </td>
                  {/* ID */}
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 13, color: '#334155', fontWeight: 600 }}>
                    {user.loginId}
                  </td>
                  {/* PW */}
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#64748b' }}>
                        {showPassword[user.no] ? user.password : '••••'}
                      </span>
                      <button
                        onClick={() => togglePw(user.no)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: 2, color: '#94a3b8', fontSize: 11,
                        }}
                        title={showPassword[user.no] ? '숨기기' : '보기'}
                      >
                        {showPassword[user.no] ? (
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                  {/* 이메일 */}
                  <td style={{ padding: '9px 12px', fontSize: 13, color: user.email ? '#2563eb' : '#cbd5e1' }}>
                    {user.email ? (
                      <a href={`mailto:${user.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                        {user.email}
                      </a>
                    ) : '-'}
                  </td>
                  {/* 연락처 */}
                  <td style={{ padding: '9px 12px', fontSize: 13, color: user.phone ? '#334155' : '#cbd5e1', whiteSpace: 'nowrap' }}>
                    {user.phone || '-'}
                  </td>
                  {/* 상태 */}
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      color: user.isActive ? '#16a34a' : '#94a3b8',
                      background: user.isActive ? '#f0fdf4' : '#f8fafc',
                      border: `1px solid ${user.isActive ? '#bbf7d0' : '#e2e8f0'}`,
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: user.isActive ? '#22c55e' : '#cbd5e1',
                      }} />
                      {user.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  {/* 관리 */}
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => {
                          // visibleUsers 인덱스 → users 인덱스로 변환
                          const realIdx = users.findIndex(u => u.no === user.no);
                          if (realIdx >= 0) handleEdit(realIdx);
                        }}
                        style={{
                          padding: '4px 10px', fontSize: 12, fontWeight: 600,
                          color: '#2563eb', background: '#eff6ff',
                          border: '1px solid #bfdbfe', borderRadius: 5,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {isSelfOnly ? '내 정보 수정' : '수정'}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            const realIdx = users.findIndex(u => u.no === user.no);
                            if (realIdx >= 0) handleToggleActive(realIdx);
                          }}
                          style={{
                            padding: '4px 10px', fontSize: 12, fontWeight: 600,
                            color: user.isActive ? '#d97706' : '#16a34a',
                            background: user.isActive ? '#fffbeb' : '#f0fdf4',
                            border: `1px solid ${user.isActive ? '#fde68a' : '#bbf7d0'}`,
                            borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          {user.isActive ? '비활성화' : '활성화'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 역할 범례 ── */}
      <div style={{
        display: 'flex', gap: 16, padding: '10px 16px',
        background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>분류 안내:</span>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
            {cat}
          </span>
        ))}
      </div>

      {/* ── 수정/등록 모달 ── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520,
            margin: '0 16px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            {/* 모달 헤더 */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                {isSelfOnly ? '내 정보 수정' : (editingIdx !== null ? '사용자 수정' : '신규 사용자 등록')}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: '#f1f5f9', border: 'none', borderRadius: 8,
                  width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>

            {/* 모달 본문 */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 이름 + 분류 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>이름 *</label>
                  <input
                    type="text" value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                      borderRadius: 7, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>분류 *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const cat = e.target.value;
                      let perm = cat;
                      if (cat === '관리자, 제한') perm = '출하관리 수정, 나머지메뉴는 모니터링';
                      setFormData({ ...formData, category: cat, permission: perm });
                    }}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                      borderRadius: 7, fontSize: 14, boxSizing: 'border-box',
                    }}
                  >
                    <option value="관리자">관리자</option>
                    <option value="모니터링">모니터링</option>
                    <option value="관리자, 제한">관리자, 제한</option>
                    <option value="운송사">운송사</option>
                  </select>
                </div>
              </div>

              {/* 권한 */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>권한 설명</label>
                <input
                  type="text" value={formData.permission}
                  onChange={(e) => setFormData({ ...formData, permission: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                    borderRadius: 7, fontSize: 14, boxSizing: 'border-box', color: '#475569',
                  }}
                />
              </div>

              {/* ID + PW */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                    ID * {isSelfOnly && <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>(변경 불가)</span>}
                  </label>
                  <input
                    type="text" value={formData.loginId}
                    onChange={(e) => setFormData({ ...formData, loginId: e.target.value })}
                    disabled={isSelfOnly}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                      borderRadius: 7, fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box',
                      background: isSelfOnly ? '#f1f5f9' : '#fff',
                      color: isSelfOnly ? '#94a3b8' : '#1e293b',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>비밀번호 *</label>
                  <input
                    type="text" value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                      borderRadius: 7, fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* 이메일 + 연락처 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>이메일</label>
                  <input
                    type="email" value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                      borderRadius: 7, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>연락처</label>
                  <input
                    type="text" value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="010-0000-0000"
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                      borderRadius: 7, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* 에러 */}
              {error && (
                <div style={{
                  background: '#fef2f2', color: '#dc2626', fontSize: 13,
                  padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca',
                }}>
                  {error}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div style={{
              padding: '14px 24px', borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 20px', fontSize: 14, fontWeight: 600,
                  color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0',
                  borderRadius: 7, cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '8px 20px', fontSize: 14, fontWeight: 600,
                  color: '#fff', background: '#2563eb', border: 'none',
                  borderRadius: 7, cursor: 'pointer',
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
