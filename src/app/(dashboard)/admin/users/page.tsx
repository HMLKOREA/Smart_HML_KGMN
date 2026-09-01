'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import type { UserRole } from '@/types';

// ── API 사용자 레코드 ──
interface ApiUser {
  id: string;
  username: string | null;
  name: string;
  role: UserRole;
  role_label: string | null;
  company_id: string | null;
  email: string | null;
  phone: string | null;
  password: string | null;
  is_active: boolean | null;
}
interface Company { id: string; name: string; }

// ── 화면 행 ──
interface UserRow {
  id: string;
  name: string;
  category: string;
  role: UserRole;
  permission: string;
  loginId: string;
  password: string;
  email: string;
  phone: string;
  company_id: string | null;
  isActive: boolean;
  isKiosk: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  '관리자': '#dc2626', '모니터링': '#2563eb', '관리자, 제한': '#d97706', '운송사': '#16a34a',
};
const CATEGORY_BG: Record<string, string> = {
  '관리자': '#fef2f2', '모니터링': '#eff6ff', '관리자, 제한': '#fffbeb', '운송사': '#f0fdf4',
};

const categoryFromRole = (role: UserRole): string =>
  role === 'admin' ? '관리자' : role === 'monitor' ? '모니터링' : role === 'field' ? '관리자, 제한' : '운송사';

const toRow = (u: ApiUser): UserRow => ({
  id: u.id,
  name: u.name,
  category: categoryFromRole(u.role),
  role: u.role,
  permission: u.role_label || categoryFromRole(u.role),
  loginId: u.username || '',
  password: u.password || '',
  email: u.email || '',
  phone: u.phone || '',
  company_id: u.company_id,
  isActive: u.is_active !== false,
  isKiosk: (u as { is_kiosk?: boolean }).is_kiosk === true,
});

const emptyForm = (): UserRow => ({
  id: '', name: '', category: '운송사', role: 'transporter', permission: '운송사',
  loginId: '', password: '', email: '', phone: '', company_id: null, isActive: true, isKiosk: false,
});

export default function UserManagementPage() {
  const { isAdmin, isTransporter, profile } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<UserRow>(emptyForm());
  const [error, setError] = useState('');

  const isSelfOnly = isTransporter && !isAdmin;

  // ── 데이터 로드 ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const res = await fetch('/api/admin/users', { cache: 'no-store' });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setUsers((json.users as ApiUser[]).map(toRow));
        setCompanies(json.companies as Company[]);
      } else if (profile) {
        // 운송사·기타 계정: 본인 정보만
        setUsers([toRow({
          id: profile.id, username: (profile as { username?: string }).username || '',
          name: profile.name, role: profile.role,
          role_label: (profile as { role_label?: string }).role_label || null,
          company_id: profile.company_id || null, email: profile.email || '',
          phone: profile.phone || '', password: (profile as { password?: string }).password || '',
          is_active: profile.is_active,
        })]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '사용자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, profile]);

  useEffect(() => { if (isAdmin || profile) load(); }, [isAdmin, profile, load]);

  const handleNew = () => {
    setIsNew(true);
    setFormData(emptyForm());
    setError('');
    setShowModal(true);
  };

  const handleEdit = (row: UserRow) => {
    setIsNew(false);
    setFormData({ ...row, password: '' }); // 비밀번호는 빈칸(변경 시에만 입력)
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.loginId) { setError('이름과 ID는 필수입니다.'); return; }
    if (isNew && !formData.password) { setError('신규 등록 시 비밀번호는 필수입니다.'); return; }
    if (formData.category === '운송사' && !formData.company_id) { setError('운송사 계정은 소속 운송사를 선택하세요.'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        name: formData.name, loginId: formData.loginId, password: formData.password || undefined,
        category: formData.category, permission: formData.permission,
        email: formData.email || undefined, phone: formData.phone || undefined,
        company_id: formData.category === '운송사' ? formData.company_id : null,
        is_kiosk: formData.isKiosk,
      };
      const res = isNew
        ? await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch(`/api/admin/users/${formData.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(isNew ? '사용자가 등록되었습니다.' : '수정되었습니다.');
      setShowModal(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: UserRow) => {
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !row.isActive }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(row.isActive ? '비활성화되었습니다.' : '활성화되었습니다.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '상태 변경 실패');
    }
  };

  const togglePw = (id: string) => setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));

  if (!isAdmin && !isTransporter) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <p style={{ color: '#9ca3af', fontSize: 15 }}>관리자 권한이 필요합니다.</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: 7, fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .users-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .users-table th { padding: 10px 12px; font-size: 13px; font-weight: 700; color: #475569; white-space: nowrap; border-bottom: 2px solid #e2e8f0; }
        .users-table td { padding: 9px 12px; }
        .users-form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 640px) { .users-table { font-size: 12px; } .users-form-grid-2 { grid-template-columns: 1fr; } }
      `}</style>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 22, background: '#2563eb', borderRadius: 2 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>사용자 관리</h2>
          <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '2px 10px', borderRadius: 10 }}>
            {isSelfOnly ? '내 정보' : `총 ${users.length}명`}
          </span>
        </div>
        {isAdmin && (
          <button onClick={handleNew} style={{
            padding: '8px 18px', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600,
            border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>+ 신규 사용자</button>
        )}
      </div>

      {/* 테이블 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="users-table">
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['이름', '분류', '권한', 'ID', 'PW', '이메일', '연락처', '상태', '관리'].map((h, i) => (
                  <th key={h} style={{ textAlign: 'left', ...(h === 'PW' ? { width: 110 } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>불러오는 중…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>사용자가 없습니다.</td></tr>
              ) : users.map((user, idx) => (
                <tr key={user.id} style={{
                  borderBottom: '1px solid #f1f5f9',
                  background: !user.isActive ? '#fafafa' : (idx % 2 === 0 ? '#fff' : '#fafcff'),
                  opacity: user.isActive ? 1 : 0.55,
                }}>
                  <td style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>{user.name}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      color: CATEGORY_COLORS[user.category] || '#475569', background: CATEGORY_BG[user.category] || '#f1f5f9',
                      whiteSpace: 'nowrap',
                    }}>{user.category}</span>
                  </td>
                  <td style={{ color: '#475569', maxWidth: 240, fontSize: 13 }}>{user.permission}</td>
                  <td style={{ fontFamily: 'monospace', color: '#334155', fontWeight: 600 }}>{user.loginId}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#64748b' }}>
                        {showPassword[user.id] ? (user.password || '—') : '••••'}
                      </span>
                      <button onClick={() => togglePw(user.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8', fontSize: 11 }}>
                        {showPassword[user.id] ? '숨김' : '보기'}
                      </button>
                    </div>
                  </td>
                  <td style={{ color: user.email ? '#2563eb' : '#cbd5e1', fontSize: 13 }}>{user.email || '-'}</td>
                  <td style={{ color: user.phone ? '#334155' : '#cbd5e1', whiteSpace: 'nowrap', fontSize: 13 }}>{user.phone || '-'}</td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      color: user.isActive ? '#16a34a' : '#94a3b8', background: user.isActive ? '#f0fdf4' : '#f8fafc',
                      border: `1px solid ${user.isActive ? '#bbf7d0' : '#e2e8f0'}`,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: user.isActive ? '#22c55e' : '#cbd5e1' }} />
                      {user.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button onClick={() => handleEdit(user)} style={{
                        padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff',
                        border: '1px solid #bfdbfe', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>{isSelfOnly ? '내 정보 수정' : '수정'}</button>
                      {isAdmin && user.id !== profile?.id && (
                        <button onClick={() => handleToggleActive(user)} style={{
                          padding: '4px 10px', fontSize: 12, fontWeight: 600,
                          color: user.isActive ? '#d97706' : '#16a34a', background: user.isActive ? '#fffbeb' : '#f0fdf4',
                          border: `1px solid ${user.isActive ? '#fde68a' : '#bbf7d0'}`, borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}>{user.isActive ? '비활성화' : '활성화'}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 범례 */}
      <div style={{ display: 'flex', gap: 16, padding: '10px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>분류 안내:</span>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />{cat}
          </span>
        ))}
      </div>

      {/* 모달 */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, margin: '0 16px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                {isSelfOnly ? '내 정보 수정' : (isNew ? '신규 사용자 등록' : '사용자 수정')}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
              <div className="users-form-grid-2">
                <div>
                  <label style={labelStyle}>이름 *</label>
                  <input type="text" value={formData.name} disabled={isSelfOnly}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>분류 *</label>
                  <select value={formData.category} disabled={isSelfOnly}
                    onChange={(e) => {
                      const cat = e.target.value;
                      let perm = cat;
                      if (cat === '관리자, 제한') perm = '출하관리 수정, 나머지메뉴는 모니터링';
                      setFormData({ ...formData, category: cat, permission: perm, company_id: cat === '운송사' ? formData.company_id : null });
                    }} style={inputStyle}>
                    <option value="관리자">관리자</option>
                    <option value="모니터링">모니터링</option>
                    <option value="관리자, 제한">관리자, 제한</option>
                    <option value="운송사">운송사</option>
                  </select>
                </div>
              </div>

              {formData.category === '운송사' && isAdmin && (
                <div>
                  <label style={labelStyle}>소속 운송사 *</label>
                  <select value={formData.company_id || ''} onChange={(e) => setFormData({ ...formData, company_id: e.target.value || null })} style={inputStyle}>
                    <option value="">[선택]</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {formData.category !== '운송사' && isAdmin && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#334155' }}>
                    <input type="checkbox" checked={formData.isKiosk} style={{ width: 18, height: 18 }}
                      onChange={(e) => setFormData({ ...formData, isKiosk: e.target.checked })} />
                    🖥️ 키오스크 모드
                  </label>
                  <p style={{ margin: '6px 0 0 27px', fontSize: 12, color: '#64748b' }}>
                    로그인하면 <b>출하증 대기화면만</b> 뜨고 다른 메뉴는 잠깁니다. 현장 게시용(기사 셀프). 분류는 <b>관리자, 제한(현장)</b> 권장.
                  </p>
                </div>
              )}

              <div>
                <label style={labelStyle}>권한 설명</label>
                <input type="text" value={formData.permission} disabled={isSelfOnly}
                  onChange={(e) => setFormData({ ...formData, permission: e.target.value })} style={{ ...inputStyle, color: '#475569' }} />
              </div>

              <div className="users-form-grid-2">
                <div>
                  <label style={labelStyle}>ID * {isSelfOnly && <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>(변경 불가)</span>}</label>
                  <input type="text" value={formData.loginId} disabled={isSelfOnly}
                    onChange={(e) => setFormData({ ...formData, loginId: e.target.value })}
                    style={{ ...inputStyle, fontFamily: 'monospace', background: isSelfOnly ? '#f1f5f9' : '#fff', color: isSelfOnly ? '#94a3b8' : '#1e293b' }} />
                </div>
                <div>
                  <label style={labelStyle}>비밀번호 {isNew ? '*' : <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>(변경 시에만 입력)</span>}</label>
                  <input type="text" value={formData.password} placeholder={isNew ? '' : '••••'}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
              </div>

              <div className="users-form-grid-2">
                <div>
                  <label style={labelStyle}>이메일</label>
                  <input type="email" value={formData.email} disabled={isSelfOnly}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>연락처</label>
                  <input type="text" value={formData.phone} placeholder="010-0000-0000"
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })} style={inputStyle} />
                </div>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowModal(false)} disabled={saving} style={{
                padding: '8px 20px', fontSize: 14, fontWeight: 600, color: '#64748b', background: '#f1f5f9',
                border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer',
              }}>취소</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '8px 20px', fontSize: 14, fontWeight: 600, color: '#fff',
                background: saving ? '#93c5fd' : '#2563eb', border: 'none', borderRadius: 7, cursor: saving ? 'default' : 'pointer',
              }}>{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
