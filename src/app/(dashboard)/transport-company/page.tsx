'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, EXCEL_COLUMNS } from '@/lib/utils/exportExcel';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { getTransporterAccounts } from '@/lib/auth/credentials';
import { sanitizeFilterValue } from '@/lib/utils/sanitize';

// ── Types ──────────────────────────────────────────────
interface TransportCompany {
  id: string;
  name: string;
  business_number: string | null;
  representative: string | null;
  phone: string | null;
  fax: string | null;
  address: string | null;
  email: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  default_vehicle_type: string | null;
  representative_name: string | null;
  dispatch_manager: string | null;
  business_manager: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CompanyFormData {
  name: string;
  business_number: string;
  representative: string;
  phone: string;
  fax: string;
  address: string;
  email: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  default_vehicle_type: string;
  representative_name: string;
  dispatch_manager: string;
  business_manager: string;
  memo: string;
  is_active: boolean;
  login_id: string;
  login_pw: string;
}

const emptyForm: CompanyFormData = {
  name: '', business_number: '', representative: '', phone: '', fax: '',
  address: '', email: '', bank_name: '', account_number: '', account_holder: '',
  default_vehicle_type: '', representative_name: '', dispatch_manager: '', business_manager: '',
  memo: '', is_active: true, login_id: '', login_pw: '',
};

// ── 운송사별 로그인 정보 매핑 ──
function getLoginInfo(companyName: string) {
  const accounts = getTransporterAccounts();
  return accounts.find(a => a.companyName === companyName) || null;
}

// ── 데모 데이터 (Supabase 미연결 시) ──
const _extra = { default_vehicle_type: null, representative_name: null, dispatch_manager: null, business_manager: null };
const DEMO_COMPANIES: TransportCompany[] = [
  { id: '1', name: '강천', business_number: '', representative: '', phone: '010-4219-2244', fax: '', address: '', email: 'han873111@naver.com', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '2', name: '대경', business_number: '', representative: '', phone: '010-9456-9988', fax: '', address: '', email: 'dydvlfl1283@naver.com', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '3', name: '동방', business_number: '', representative: '', phone: '010-9138-0775', fax: '', address: '', email: 'hwkim@dongbang.co.kr', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '4', name: '성윤', business_number: '', representative: '', phone: '010-6500-1101', fax: '', address: '', email: '', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '5', name: '성진', business_number: '', representative: '', phone: '010-3675-2872', fax: '', address: '', email: 'sung2872@daum.net', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '6', name: '우신', business_number: '', representative: '', phone: '', fax: '', address: '', email: 'wsts6663@nate.com', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '7', name: '우주', business_number: '', representative: '', phone: '010-5483-4667', fax: '', address: '', email: 'ouju4667@hanmail.net', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '8', name: '진흥', business_number: '', representative: '', phone: '010-3673-0193', fax: '', address: '', email: 'jh0193@hanmail.net', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '9', name: '태윤', business_number: '', representative: '', phone: '010-3471-0267', fax: '', address: '', email: 'kdj879@hanmail.net', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
  { id: '10', name: '퍼스트', business_number: '', representative: '', phone: '010-6259-8393', fax: '', address: '', email: 'firstinc@hanmail.net', bank_name: '', account_number: '', account_holder: '', memo: '', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', ..._extra },
];

// ── Component ──────────────────────────────────────────
export default function TransportCompanyPage() {
  const supabase = createClient();
  const toast = useToast();
  const { isAdmin, isTransporter, profile } = useAuth();

  const [data, setData] = useState<TransportCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<CompanyFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // ── Data Fetching ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('transport_companies')
        .select('*')
        .order('name');

      if (searchText) {
        const safeSearch = sanitizeFilterValue(searchText.trim());
        query = query.or(
          `name.ilike.%${safeSearch}%,business_number.ilike.%${safeSearch}%,representative.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,address.ilike.%${safeSearch}%`
        );
      }

      const { data: result, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      let companies = result || [];
      // Supabase 데이터가 없으면 데모 데이터 사용
      if (companies.length === 0) {
        companies = DEMO_COMPANIES;
      }

      // 운송사 계정: 자기 회사만 표시
      if (isTransporter && profile?.company_name) {
        companies = companies.filter(c => c.name === profile.company_name);
      }

      setData(companies);
    } catch {
      // Supabase 연결 실패 시 데모 데이터
      let companies = DEMO_COMPANIES;
      if (isTransporter && profile?.company_name) {
        companies = companies.filter(c => c.name === profile.company_name);
      }
      setData(companies);
    } finally {
      setLoading(false);
    }
  }, [supabase, searchText, isTransporter, profile]);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────
  const handleSearch = () => fetchData();
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const togglePw = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ── CRUD ─────────────────────────────────────────────
  const handleNew = () => {
    setIsEditing(false);
    setFormData({ ...emptyForm });
    setModalOpen(true);
  };

  const handleEdit = (directId?: string) => {
    const targetId = directId || selectedId;
    if (!targetId) {
      toast.warning('수정할 항목을 선택해주세요.');
      return;
    }
    const row = data.find((d) => d.id === targetId);
    if (!row) return;

    const loginInfo = getLoginInfo(row.name);

    setIsEditing(true);
    setFormData({
      name: row.name,
      business_number: row.business_number || '',
      representative: row.representative || '',
      phone: row.phone || '',
      fax: row.fax || '',
      address: row.address || '',
      email: row.email || '',
      bank_name: row.bank_name || '',
      account_number: row.account_number || '',
      account_holder: row.account_holder || '',
      default_vehicle_type: row.default_vehicle_type || '',
      representative_name: row.representative_name || '',
      dispatch_manager: row.dispatch_manager || '',
      business_manager: row.business_manager || '',
      memo: row.memo || '',
      is_active: row.is_active,
      login_id: loginInfo?.loginId || '',
      login_pw: loginInfo?.password || '',
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedId) { toast.warning('삭제할 항목을 선택해주세요.'); return; }
    if (!confirm('선택한 운송사를 삭제하시겠습니까?')) return;
    try {
      const { error: delError } = await supabase
        .from('transport_companies')
        .delete()
        .eq('id', selectedId);
      if (delError) throw delError;
      setSelectedId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.warning('운송사명은 필수 입력입니다.'); return; }
    try {
      const payload = {
        name: formData.name.trim(),
        business_number: formData.business_number || null,
        representative: formData.representative || null,
        phone: formData.phone || null,
        fax: formData.fax || null,
        address: formData.address || null,
        email: formData.email || null,
        bank_name: formData.bank_name || null,
        account_number: formData.account_number || null,
        account_holder: formData.account_holder || null,
        default_vehicle_type: formData.default_vehicle_type || null,
        representative_name: formData.representative_name || null,
        dispatch_manager: formData.dispatch_manager || null,
        business_manager: formData.business_manager || null,
        memo: formData.memo || null,
        is_active: formData.is_active,
        // NOTE: login_id / login_pw are NOT saved to the transport_companies DB table.
        // Login credentials are managed via the hardcoded auth system in credentials.ts
        // (getTransporterAccounts). To persist login info changes, update credentials.ts directly.
      };

      if (isEditing && selectedId) {
        const { error: updError } = await supabase
          .from('transport_companies')
          .update(payload)
          .eq('id', selectedId);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase
          .from('transport_companies')
          .insert(payload);
        if (insError) throw insError;
      }

      setModalOpen(false);
      fetchData();
      toast.success(isEditing ? '수정되었습니다.' : '등록되었습니다.');
    } catch {
      // 데모 모드
      setModalOpen(false);
      toast.success(isEditing ? '수정되었습니다.' : '등록되었습니다.');
    }
  };

  const handleExcel = () => {
    exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLUMNS.companies, '운송사관리');
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── 페이지 헤더 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 22, background: '#2563eb', borderRadius: 2 }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>운송사관리</h1>
          <span style={{
            fontSize: 12, color: '#64748b', background: '#f1f5f9',
            padding: '2px 10px', borderRadius: 10,
          }}>
            총 {data.length}건
          </span>
        </div>
      </div>

      {/* ── 검색 + 액션 바 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
        background: '#fafbfc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap',
      }}>
        <input
          type="text"
          placeholder="운송사명, 사업자번호, 대표자, 전화번호 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="search-input-responsive"
          style={{
            padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6,
            fontSize: 14, outline: 'none', minWidth: 0,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleSearch} style={{
            padding: '7px 16px', background: '#2563eb', color: '#fff',
            fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
          }}>조회</button>

          <div style={{ width: 1, height: 24, background: '#e2e8f0', margin: '0 4px' }} />

          {isAdmin && (
            <>
              <button onClick={handleNew} style={{
                padding: '7px 14px', background: '#2563eb', color: '#fff',
                fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
              }}>신규등록</button>
              <button onClick={() => handleEdit()} style={{
                padding: '7px 14px', background: '#fff', color: '#334155',
                fontSize: 13, fontWeight: 600, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer',
              }}>수정</button>
              <button onClick={handleDelete} style={{
                padding: '7px 14px', background: '#fff', color: '#dc2626',
                fontSize: 13, fontWeight: 600, border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer',
              }}>삭제</button>
            </>
          )}
          {isTransporter && (
            <button onClick={() => { if (data[0]) { setSelectedId(data[0].id); handleEdit(data[0].id); } }} style={{
              padding: '7px 14px', background: '#2563eb', color: '#fff',
              fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
            }}>내 정보 수정</button>
          )}

          <button onClick={handleExcel} style={{
            padding: '7px 14px', background: '#16a34a', color: '#fff',
            fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
          }}>엑셀</button>
        </div>
      </div>

      {/* ── 에러 ── */}
      {error && (
        <div style={{ margin: '8px 20px', padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* ── 데이터 테이블 ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: '#94a3b8', fontSize: 14 }}>
            데이터를 불러오는 중...
          </div>
        ) : data.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: '#94a3b8', fontSize: 14 }}>
            조회된 데이터가 없습니다.
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['No', '운송사명', '로그인 ID', '로그인 PW', '대표자', '전화번호', '이메일', '기본차량종류', '대표명', '배차담당자', '업무담당자', '팩스', '주소', '은행', '계좌번호', '예금주', '사용', '비고'].map((h, i) => (
                      <th key={h} style={{
                        padding: '10px 10px', fontSize: 13, fontWeight: 700, color: '#475569',
                        textAlign: i === 0 ? 'center' : 'left', whiteSpace: 'nowrap',
                        borderBottom: '2px solid #e2e8f0',
                        ...(i === 0 ? { width: 44 } : {}),
                        ...(h === '로그인 ID' || h === '로그인 PW' ? { background: '#eff6ff' } : {}),
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => {
                    const loginInfo = getLoginInfo(row.name);
                    const isSelected = selectedId === row.id;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        onDoubleClick={() => { setSelectedId(row.id); handleEdit(row.id); }}
                        style={{
                          borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                          background: isSelected ? '#dbeafe' : (idx % 2 === 0 ? '#fff' : '#fafcff'),
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f0f4ff'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafcff'; }}
                      >
                        {/* No */}
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>{idx + 1}</td>
                        {/* 운송사명 */}
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{row.name}</td>
                        {/* 로그인 ID */}
                        <td style={{ padding: '8px 10px', background: isSelected ? '#dbeafe' : '#f8fafc' }}>
                          <span style={{
                            fontFamily: 'monospace', fontSize: 14, fontWeight: 700,
                            color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 4,
                            border: '1px solid #bfdbfe',
                          }}>
                            {loginInfo?.loginId || '-'}
                          </span>
                        </td>
                        {/* 로그인 PW */}
                        <td style={{ padding: '8px 10px', background: isSelected ? '#dbeafe' : '#f8fafc' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#64748b' }}>
                              {showPasswords[row.id] ? (loginInfo?.password || '-') : '••••'}
                            </span>
                            {loginInfo && (
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePw(row.id); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8' }}
                                title={showPasswords[row.id] ? '숨기기' : '보기'}
                              >
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  {showPasswords[row.id] ? (
                                    <path strokeLinecap="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                                  ) : (
                                    <>
                                      <path strokeLinecap="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                      <path strokeLinecap="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                    </>
                                  )}
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                        {/* 대표자 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#334155' }}>{row.representative || '-'}</td>
                        {/* 전화번호 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#334155', whiteSpace: 'nowrap' }}>{row.phone || '-'}</td>
                        {/* 이메일 */}
                        <td style={{ padding: '8px 10px', fontSize: 13 }}>
                          {row.email ? (
                            <a href={`mailto:${row.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{row.email}</a>
                          ) : <span style={{ color: '#cbd5e1' }}>-</span>}
                        </td>
                        {/* 기본차량종류 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#334155' }}>{row.default_vehicle_type || '-'}</td>
                        {/* 대표명 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#334155' }}>{row.representative_name || '-'}</td>
                        {/* 배차담당자 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#334155' }}>{row.dispatch_manager || '-'}</td>
                        {/* 업무담당자 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#334155' }}>{row.business_manager || '-'}</td>
                        {/* 팩스 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#64748b' }}>{row.fax || '-'}</td>
                        {/* 주소 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.address || '-'}</td>
                        {/* 은행 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#64748b' }}>{row.bank_name || '-'}</td>
                        {/* 계좌번호 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#64748b' }}>{row.account_number || '-'}</td>
                        {/* 예금주 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#64748b' }}>{row.account_holder || '-'}</td>
                        {/* 사용 */}
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                            color: row.is_active ? '#16a34a' : '#94a3b8',
                            background: row.is_active ? '#f0fdf4' : '#f8fafc',
                            border: `1px solid ${row.is_active ? '#bbf7d0' : '#e2e8f0'}`,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.is_active ? '#22c55e' : '#cbd5e1' }} />
                            {row.is_active ? '사용' : '미사용'}
                          </span>
                        </td>
                        {/* 비고 */}
                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#64748b', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.memo || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── 모달 ── */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 'min(680px, calc(100vw - 32px))', margin: '0 16px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {/* 모달 헤더 */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                {isEditing ? '운송사 수정' : '운송사 신규등록'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>

            {/* 모달 본문 */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* ── 로그인 정보 섹션 ── */}
              <div style={{
                padding: 16, background: '#eff6ff', borderRadius: 10,
                border: '1px solid #bfdbfe',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  로그인 정보
                </div>
                <div className="grid-cols-1-sm-2" style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                      로그인 ID {isTransporter && <span style={{ color: '#94a3b8', fontWeight: 400 }}>(변경 불가)</span>}
                    </label>
                    <input
                      type="text" value={formData.login_id}
                      onChange={(e) => setFormData({ ...formData, login_id: e.target.value })}
                      disabled={isTransporter}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid #93c5fd',
                        borderRadius: 7, fontSize: 14, fontFamily: 'monospace', fontWeight: 700,
                        boxSizing: 'border-box', background: isTransporter ? '#f1f5f9' : '#fff',
                        color: isTransporter ? '#94a3b8' : '#1e293b',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>비밀번호</label>
                    <input
                      type="text" value={formData.login_pw}
                      onChange={(e) => setFormData({ ...formData, login_pw: e.target.value })}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1px solid #93c5fd',
                        borderRadius: 7, fontSize: 14, fontFamily: 'monospace',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* ── 기본 정보 ── */}
              <div className="grid-cols-1-sm-2" style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>운송사명 *</label>
                  <input type="text" value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={isTransporter}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box', background: isTransporter ? '#f8fafc' : '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>사업자번호</label>
                  <input type="text" value={formData.business_number} placeholder="000-00-00000"
                    onChange={(e) => setFormData({ ...formData, business_number: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div className="grid-cols-1-sm-2-md-3" style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>대표자</label>
                  <input type="text" value={formData.representative}
                    onChange={(e) => setFormData({ ...formData, representative: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>전화번호</label>
                  <input type="text" value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>팩스</label>
                  <input type="text" value={formData.fax}
                    onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>주소</label>
                <input type="text" value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>이메일</label>
                <input type="email" value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div className="grid-cols-2-sm-4" style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>기본차량종류</label>
                  <select value={formData.default_vehicle_type}
                    onChange={(e) => setFormData({ ...formData, default_vehicle_type: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  >
                    <option value="">선택</option>
                    <option value="탱크">탱크</option>
                    <option value="덤프">덤프</option>
                    <option value="카고">카고</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>대표명</label>
                  <input type="text" value={formData.representative_name}
                    onChange={(e) => setFormData({ ...formData, representative_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>배차담당자</label>
                  <input type="text" value={formData.dispatch_manager}
                    onChange={(e) => setFormData({ ...formData, dispatch_manager: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>업무담당자</label>
                  <input type="text" value={formData.business_manager}
                    onChange={(e) => setFormData({ ...formData, business_manager: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div className="grid-cols-1-sm-2-md-3" style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>은행명</label>
                  <input type="text" value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>계좌번호</label>
                  <input type="text" value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>예금주</label>
                  <input type="text" value={formData.account_holder}
                    onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>비고</label>
                <textarea value={formData.memo} rows={2}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              {isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="is_active_chk" checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                  <label htmlFor="is_active_chk" style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>사용여부</label>
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div style={{
              padding: '14px 24px', borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fafbfc',
            }}>
              <button onClick={() => setModalOpen(false)} style={{
                padding: '8px 20px', fontSize: 14, fontWeight: 600, color: '#64748b',
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer',
              }}>취소</button>
              <button onClick={handleSave} style={{
                padding: '8px 20px', fontSize: 14, fontWeight: 600, color: '#fff',
                background: '#2563eb', border: 'none', borderRadius: 7, cursor: 'pointer',
              }}>{isEditing ? '수정' : '등록'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
