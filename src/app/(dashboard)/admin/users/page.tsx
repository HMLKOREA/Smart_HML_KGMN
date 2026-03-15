'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import type { UserProfile, UserRole } from '@/types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '관리자 (하멜코리아)',
  monitor: '모니터링 (서울경기광업)',
  transporter: '운송사',
  field: '현장 (경기광업)',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800',
  monitor: 'bg-blue-100 text-blue-800',
  transporter: 'bg-green-100 text-green-800',
  field: 'bg-amber-100 text-amber-800',
};

export default function UserManagementPage() {
  const { isAdmin } = useAuth();
  const supabase = createClient();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'transporter' as UserRole,
    company_id: '',
    phone: '',
    is_active: true,
  });
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUsers(data as UserProfile[]);
    }
    setLoading(false);
  }, [supabase]);

  const loadCompanies = useCallback(async () => {
    const { data } = await supabase
      .from('transport_companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (data) setCompanies(data);
  }, [supabase]);

  useEffect(() => {
    loadUsers();
    loadCompanies();
  }, [loadUsers, loadCompanies]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">관리자 권한이 필요합니다.</p>
      </div>
    );
  }

  const handleNew = () => {
    setEditingUser(null);
    setFormData({ email: '', password: '', name: '', role: 'transporter', company_id: '', phone: '', is_active: true });
    setError('');
    setShowModal(true);
  };

  const handleEdit = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      role: user.role,
      company_id: user.company_id || '',
      phone: user.phone || '',
      is_active: user.is_active,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      setError('');

      if (!formData.name || !formData.email) {
        setError('이름과 이메일은 필수입니다.');
        return;
      }

      if (editingUser) {
        // 기존 사용자 수정
        const updateData: Record<string, unknown> = {
          name: formData.name,
          role: formData.role,
          company_id: formData.company_id || null,
          phone: formData.phone || null,
          is_active: formData.is_active,
        };

        const { error: updateError } = await supabase
          .from('user_profiles')
          .update(updateData)
          .eq('id', editingUser.id);

        if (updateError) throw updateError;
      } else {
        // 신규 사용자 - Supabase Auth로 계정 생성 후 프로필 추가
        if (!formData.password || formData.password.length < 6) {
          setError('비밀번호는 6자 이상이어야 합니다.');
          return;
        }

        // 이 기능은 서비스 역할 키가 필요하므로 API를 통해 처리
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        const result = await res.json();
        if (!result.success) {
          throw new Error(result.error || '사용자 생성 실패');
        }
      }

      setShowModal(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    }
  };

  const handleToggleActive = async (user: UserProfile) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: !user.is_active })
      .eq('id', user.id);

    if (!error) loadUsers();
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">사용자 관리</h2>
        <button
          onClick={handleNew}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          + 신규 사용자
        </button>
      </div>

      {/* 사용자 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>역할</th>
                <th>연락처</th>
                <th>상태</th>
                <th>가입일</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8">로딩 중...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">등록된 사용자가 없습니다</td></tr>
              ) : users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="font-medium">{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`badge ${ROLE_COLORS[user.role] || ''}`}>
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  </td>
                  <td>{user.phone || '-'}</td>
                  <td>
                    <span className={`badge ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {user.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td>{user.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '-'}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(user)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`px-2 py-1 text-xs rounded ${
                          user.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {user.is_active ? '비활성화' : '활성화'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-xl">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {editingUser ? '사용자 수정' : '신규 사용자 등록'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  disabled={!!editingUser}
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="6자 이상"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">역할 *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {formData.role === 'transporter' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">소속 운송사</label>
                  <select
                    value={formData.company_id}
                    onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">선택</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="010-0000-0000"
                />
              </div>

              {editingUser && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <label htmlFor="is_active" className="text-sm">활성 계정</label>
                </div>
              )}

              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
