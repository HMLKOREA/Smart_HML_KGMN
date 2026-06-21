'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { UserRole } from '@/types';
import { clearSession } from '@/lib/auth/session';

/* ────── Heroicon SVG mini-components ────── */
const icons: Record<string, React.ReactNode> = {
  dashboard: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  ),
  shipping: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  ),
  dispatch: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121l-2.246-2.245A2.999 2.999 0 0 0 16.875 9H14.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H5.25c-.621 0-1.125.504-1.125 1.125v12.249" />
    </svg>
  ),
  company: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  ),
  customer: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </svg>
  ),
  driver: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  ),
  product: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  ),
  report: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  settlement: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  ),
  production: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  ),
  dailyReport: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  users: (
    <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
};

interface NavItem {
  label: string;
  path: string;
  iconKey: string;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  { label: '대시보드', path: '/home', iconKey: 'dashboard', roles: ['admin', 'monitor', 'field', 'transporter'] },
  { label: '출하관리', path: '/shipping', iconKey: 'shipping', roles: ['admin', 'monitor', 'field'] },
  { label: '배차관리', path: '/dispatch', iconKey: 'dispatch', roles: ['admin', 'monitor', 'field', 'transporter'] },
  { label: '운송사관리', path: '/transport-company', iconKey: 'company', roles: ['admin', 'monitor', 'transporter'] },
  { label: '거래처관리', path: '/customer', iconKey: 'customer', roles: ['admin', 'monitor'] },
  { label: '기사관리', path: '/driver', iconKey: 'driver', roles: ['admin', 'monitor', 'transporter'] },
  { label: '제품코드관리', path: '/product-code', iconKey: 'product', roles: ['admin', 'monitor'] },
  { label: '성적서관리', path: '/report', iconKey: 'report', roles: ['admin', 'monitor', 'field'] },
  { label: '생산현황', path: '/production', iconKey: 'production', roles: ['admin', 'monitor', 'field'] },
  { label: '정산관리', path: '/settlement', iconKey: 'settlement', roles: ['admin', 'monitor', 'transporter'] },
  { label: '일일보고', path: '/daily-report', iconKey: 'dailyReport', roles: ['admin', 'monitor'] },
  { label: '사용자관리', path: '/admin/users', iconKey: 'users', roles: ['admin'] },
];

interface SidebarProps {
  userRole: UserRole;
  userName: string;
  collapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ userRole, userName, collapsed, onToggle, isMobile, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const filteredNav = navItems.filter(item => item.roles.includes(userRole));

  const roleLabel: Record<UserRole, string> = {
    admin: '관리자',
    monitor: '모니터링',
    transporter: '운송사',
    field: '현장',
  };

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  const handleNavClick = () => {
    if (isMobile && onClose) onClose();
  };

  const sidebarWidth = isMobile ? 280 : collapsed ? 64 : 260;

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col transition-[width] duration-300 overflow-hidden"
      style={{
        width: sidebarWidth,
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        color: 'white',
        zIndex: 50,
        boxShadow: isMobile ? '8px 0 32px rgba(0,0,0,0.3)' : '4px 0 24px rgba(0,0,0,0.15)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.06] shrink-0">
        {(!collapsed || isMobile) && (
          <Link href="/home" className="flex items-center gap-3 no-underline text-white" onClick={handleNavClick}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.3)] shrink-0">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121l-2.246-2.245A2.999 2.999 0 0 0 16.875 9H14.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H5.25c-.621 0-1.125.504-1.125 1.125v12.249" />
              </svg>
            </div>
            <span className="text-[17px] font-bold tracking-tight">
              Smart<span className="text-blue-400">HML</span>
            </span>
          </Link>
        )}
        <button
          onClick={isMobile ? onClose : onToggle}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition shrink-0"
          aria-label={isMobile ? '메뉴 닫기' : '메뉴 토글'}
        >
          {isMobile ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-4 h-4 transition-transform duration-300" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          )}
        </button>
      </div>

      {/* User Info */}
      {(!collapsed || isMobile) && (
        <div className="px-4 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-[15px] font-bold shrink-0 shadow-[0_4px_12px_rgba(99,102,241,0.3)]">
              {userName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold truncate">{userName}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                ${userRole === 'admin' ? 'bg-rose-500/70' : userRole === 'monitor' ? 'bg-sky-500/70' : userRole === 'transporter' ? 'bg-emerald-500/70' : 'bg-amber-500/70'}
              `}>
                {roleLabel[userRole]}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
        <div className="flex flex-col gap-0.5">
          {filteredNav.map((item) => {
            const isActive = pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={handleNavClick}
                className={`flex items-center gap-3 rounded-lg text-[14px] font-medium transition-all no-underline
                  ${collapsed && !isMobile ? 'justify-center p-3' : 'px-3 py-2.5'}
                  ${isActive
                    ? 'text-white bg-blue-600/85 shadow-[0_4px_12px_rgba(37,99,235,0.25)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}
                `}
                title={item.label}
              >
                <span className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {icons[item.iconKey]}
                </span>
                {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom */}
      {(!collapsed || isMobile) && (
        <div className="border-t border-white/[0.06] shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-5 py-3.5 text-[14px] text-slate-500 hover:text-red-400 hover:bg-white/[0.03] transition text-left"
          >
            <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            <span>로그아웃</span>
          </button>
          <div className="px-5 pb-3 text-[11px] text-slate-600">
            SmartHML v1.0
          </div>
        </div>
      )}
    </aside>
  );
}
