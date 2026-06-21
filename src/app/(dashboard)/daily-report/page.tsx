'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/* ────── 타입 ────── */
interface SummaryRow { name: string; count: number; weight: number }

interface ReportData {
  date: string;
  summary: {
    totalCount: number;
    totalWeight: number;
    completedCount: number;
    completionRate: number;
    companyCount: number;
    customerCount: number;
  };
  byCompany: SummaryRow[];
  byProduct: SummaryRow[];
  byCustomer: SummaryRow[];
  byTransportType: SummaryRow[];
  details: {
    shipmentNumber: string;
    company: string;
    customer: string;
    product: string;
    vehicle: string;
    weight: number;
    type: string;
    status: string;
  }[];
}

interface TelegramStatus { configured: boolean; botToken: string; chatId: string }

/* ────── 유틸 ────── */
const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

function getStatusLabel(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: '대기', color: 'bg-gray-100 text-gray-700' },
    dispatched: { label: '배차', color: 'bg-blue-100 text-blue-700' },
    in_transit: { label: '운송중', color: 'bg-yellow-100 text-yellow-700' },
    delivered: { label: '도착', color: 'bg-green-100 text-green-700' },
    completed: { label: '완료', color: 'bg-emerald-100 text-emerald-700' },
    cancelled: { label: '취소', color: 'bg-red-100 text-red-700' },
  };
  return map[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
}

/* ────── 메인 ────── */
export default function DailyReportPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'company' | 'product' | 'customer' | 'detail'>('company');

  // 주간 날짜 목록 (최근 7일)
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });

  const fetchReport = useCallback(async (date: string) => {
    setLoading(true);
    setSendResult(null);
    try {
      const supabase = createClient();

      // 출하 데이터 직접 조회 + 조인
      const { data: shipments } = await supabase
        .from('shipments')
        .select(`
          shipment_number, shipment_date, weight_net, status,
          transport_type, vehicle_number, is_confirmed,
          transport_companies!shipments_company_id_fkey(name),
          customers!shipments_customer_id_fkey(name),
          products!shipments_product_id_fkey(name, code)
        `)
        .eq('shipment_date', date)
        .order('created_at', { ascending: true });

      const rows = (shipments || []).map((s: Record<string, unknown>) => ({
        shipmentNumber: s.shipment_number as string,
        company: (s.transport_companies as Record<string, string>)?.name || '미지정',
        customer: (s.customers as Record<string, string>)?.name || '미지정',
        product: (s.products as Record<string, string>)?.name || '미지정',
        vehicle: (s.vehicle_number as string) || '',
        weight: Number(s.weight_net) || 0,
        type: (s.transport_type as string) || '미지정',
        status: s.status as string,
      }));

      // 집계
      const aggregate = (key: 'company' | 'customer' | 'product' | 'type') => {
        const map = new Map<string, { count: number; weight: number }>();
        for (const r of rows) {
          const name = r[key];
          const prev = map.get(name) || { count: 0, weight: 0 };
          map.set(name, { count: prev.count + 1, weight: prev.weight + r.weight });
        }
        return Array.from(map.entries())
          .map(([name, v]) => ({ name, count: v.count, weight: Math.round(v.weight * 100) / 100 }))
          .sort((a, b) => b.weight - a.weight);
      };

      const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
      const completed = rows.filter(r => r.status === 'completed').length;

      setReport({
        date,
        summary: {
          totalCount: rows.length,
          totalWeight: Math.round(totalWeight * 100) / 100,
          completedCount: completed,
          completionRate: rows.length > 0 ? Math.round((completed / rows.length) * 100) : 0,
          companyCount: new Set(rows.map(r => r.company)).size,
          customerCount: new Set(rows.map(r => r.customer)).size,
        },
        byCompany: aggregate('company'),
        byProduct: aggregate('product'),
        byCustomer: aggregate('customer'),
        byTransportType: aggregate('type'),
        details: rows,
      });
    } catch (err) {
      console.error('보고 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReport(selectedDate); }, [selectedDate, fetchReport]);

  // 텔레그램 상태 확인
  useEffect(() => {
    fetch('/api/telegram').then(r => r.json()).then(setTelegramStatus).catch(() => {});
  }, []);

  const sendTelegram = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const data = await res.json();
      if (data.success) {
        setSendResult('✅ 텔레그램 전송 완료!');
      } else {
        setSendResult(`❌ ${data.error}`);
      }
    } catch (err) {
      setSendResult(`❌ 전송 실패: ${err}`);
    } finally {
      setSending(false);
    }
  };

  const d = new Date(selectedDate);
  const dayName = dayNames[d.getDay()];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">일일 배차결과 보고</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {selectedDate} ({dayName}) 출하 현황 요약
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="flex-1 min-w-0 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={sendTelegram}
            disabled={sending || !telegramStatus?.configured}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#0088cc] text-white rounded-lg text-sm font-medium hover:bg-[#006fa8] disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
            title={!telegramStatus?.configured ? '텔레그램 설정이 필요합니다 (.env.local)' : '텔레그램으로 보고 전송'}
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            {sending ? '전송중...' : '텔레그램 전송'}
          </button>
        </div>
      </div>

      {/* 전송 결과 */}
      {sendResult && (
        <div className={`p-3 rounded-lg text-sm ${sendResult.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {sendResult}
        </div>
      )}

      {/* 빠른 날짜 선택 (최근 7일) */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1">
        {weekDates.map(date => {
          const dd = new Date(date);
          const isSelected = date === selectedDate;
          const isWeekend = dd.getDay() === 0 || dd.getDay() === 6;
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`flex-shrink-0 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border transition
                ${isSelected
                  ? 'bg-blue-600 text-white border-blue-600'
                  : isWeekend
                    ? 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}
              `}
            >
              <div className="text-xs">{date.slice(5)}</div>
              <div>{dayNames[dd.getDay()]}</div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !report ? (
        <div className="text-center text-gray-400 py-20">데이터를 불러올 수 없습니다</div>
      ) : report.summary.totalCount === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-gray-500 text-lg">해당 날짜의 출하 데이터가 없습니다</p>
          <p className="text-gray-400 text-sm mt-1">{selectedDate} ({dayName})</p>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SummaryCard
              title="총 출하"
              value={`${report.summary.totalCount}건`}
              sub={`${fmt(report.summary.totalWeight)}톤`}
              icon="📦"
              color="blue"
            />
            <SummaryCard
              title="완료율"
              value={`${report.summary.completionRate}%`}
              sub={`${report.summary.completedCount}/${report.summary.totalCount}건`}
              icon="✅"
              color="green"
            />
            <SummaryCard
              title="운송사"
              value={`${report.summary.companyCount}개사`}
              sub="참여 운송사"
              icon="🚛"
              color="purple"
            />
            <SummaryCard
              title="거래처"
              value={`${report.summary.customerCount}개사`}
              sub="배송 거래처"
              icon="🏭"
              color="amber"
            />
          </div>

          {/* 운송유형별 바 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">운송유형별 현황</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {report.byTransportType.map(t => {
                const pct = report!.summary.totalWeight > 0
                  ? Math.round((t.weight / report!.summary.totalWeight) * 100)
                  : 0;
                const colors: Record<string, string> = {
                  '탱크': 'bg-blue-500', '덤프': 'bg-amber-500', '카고': 'bg-green-500',
                };
                return (
                  <div key={t.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">{t.name}</span>
                      <span className="text-gray-500 text-xs sm:text-sm">{t.count}건 / {fmt(t.weight)}t</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${colors[t.name] || 'bg-gray-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-1 text-right">{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 탭 선택 */}
          <div className="border-b border-gray-200 overflow-x-auto">
            <div className="flex gap-0 min-w-max">
              {([
                { key: 'company', label: '운송사별' },
                { key: 'product', label: '제품별' },
                { key: 'customer', label: '거래처별' },
                { key: 'detail', label: '상세내역' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap
                    ${activeTab === tab.key
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'}
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 탭 콘텐츠 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {activeTab === 'company' && <AggTable rows={report.byCompany} total={report.summary} />}
            {activeTab === 'product' && <AggTable rows={report.byProduct} total={report.summary} />}
            {activeTab === 'customer' && <AggTable rows={report.byCustomer} total={report.summary} />}
            {activeTab === 'detail' && <DetailTable rows={report.details} />}
          </div>
        </>
      )}
    </div>
  );
}

/* ────── 컴포넌트 ────── */

function SummaryCard({ title, value, sub, icon, color }: {
  title: string; value: string; sub: string; icon: string;
  color: 'blue' | 'green' | 'purple' | 'amber';
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
    purple: 'bg-purple-50 border-purple-100',
    amber: 'bg-amber-50 border-amber-100',
  };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
        <span className="text-lg sm:text-xl">{icon}</span>
        <span className="text-xs font-medium text-gray-500 uppercase">{title}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs sm:text-sm text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function AggTable({ rows, total }: { rows: SummaryRow[]; total: { totalCount: number; totalWeight: number } }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm min-w-[400px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 font-semibold text-gray-600">구분</th>
            <th className="text-right px-3 sm:px-4 py-2.5 sm:py-3 font-semibold text-gray-600">건수</th>
            <th className="text-right px-3 sm:px-4 py-2.5 sm:py-3 font-semibold text-gray-600">중량(톤)</th>
            <th className="text-right px-3 sm:px-4 py-2.5 sm:py-3 font-semibold text-gray-600 w-24 sm:w-32">비중</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pct = total.totalWeight > 0 ? Math.round((r.weight / total.totalWeight) * 100) : 0;
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 sm:px-4 py-2 sm:py-3 font-medium text-gray-900">{r.name}</td>
                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right text-gray-600">{r.count}</td>
                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right font-medium text-gray-900">{fmt(r.weight)}</td>
                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right">
                  <div className="flex items-center justify-end gap-1 sm:gap-2">
                    <div className="w-12 sm:w-16 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-gray-500 w-7 sm:w-8 text-right">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold">
            <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-gray-700">합계</td>
            <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-gray-700">{total.totalCount}</td>
            <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-gray-900">{fmt(total.totalWeight)}</td>
            <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-gray-500">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DetailTable({ rows }: { rows: ReportData['details'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm min-w-[600px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-2 sm:px-3 py-2 sm:py-2.5 font-semibold text-gray-600">#</th>
            <th className="text-left px-2 sm:px-3 py-2 sm:py-2.5 font-semibold text-gray-600">운송사</th>
            <th className="text-left px-2 sm:px-3 py-2 sm:py-2.5 font-semibold text-gray-600">거래처</th>
            <th className="text-left px-2 sm:px-3 py-2 sm:py-2.5 font-semibold text-gray-600">제품</th>
            <th className="text-left px-2 sm:px-3 py-2 sm:py-2.5 font-semibold text-gray-600">차량</th>
            <th className="text-left px-2 sm:px-3 py-2 sm:py-2.5 font-semibold text-gray-600">유형</th>
            <th className="text-right px-2 sm:px-3 py-2 sm:py-2.5 font-semibold text-gray-600">중량</th>
            <th className="text-center px-2 sm:px-3 py-2 sm:py-2.5 font-semibold text-gray-600">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const st = getStatusLabel(r.status);
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-gray-400">{i + 1}</td>
                <td className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-800">{r.company}</td>
                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-gray-700">{r.customer}</td>
                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-gray-700">{r.product}</td>
                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-gray-500 font-mono text-xs">{r.vehicle}</td>
                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-gray-500">{r.type}</td>
                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right font-medium">{r.weight > 0 ? fmt(r.weight) : '-'}</td>
                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-center">
                  <span className={`inline-block px-1.5 sm:px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
