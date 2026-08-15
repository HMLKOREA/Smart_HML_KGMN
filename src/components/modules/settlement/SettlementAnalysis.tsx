'use client';

import { useEffect } from 'react';
import type { AnalysisPayload, Triple } from '@/lib/analysis/settlementAnalysis';

/* 정산 분석 정형장표 — 깔끔 도표(공통) + 상세 부속서(관리자만) */

const won = (n: number | null | undefined) => n == null ? '-' : '₩' + Math.round(n).toLocaleString('ko-KR');
const mil = (n: number) => '₩' + (n / 1_000_000).toFixed(1) + '백만';
const ton = (n: number | null | undefined) => n == null ? '-' : n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const p1 = (n: number | null | undefined) => n == null ? '-' : n.toFixed(1) + '%';
const NAVY = '#204080', RED = '#E00010', BLUE = '#2b5cab', INK = '#1f2937', SOFT = '#6b7280', LINE = '#e5e7eb';

function Pill({ v }: { v: number }) {
  const up = v >= 0;
  return <span style={{ color: up ? BLUE : RED, fontWeight: 800, fontSize: 14 }}>{up ? '▲' : '▼'} {Math.abs(v).toFixed(1)}%</span>;
}

export default function SettlementAnalysis({ payload, isAdmin, onClose }: { payload: AnalysisPayload; isAdmin: boolean; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const { meta, kpi, reconciliation: rec, volumeNote: vn, carriers, clients, concentration: con, trend, detail, summary, checks } = payload;
  const maxTrendFreight = Math.max(1, ...trend.map(t => t.freightTotal));
  const maxTrendTons = Math.max(1, ...trend.map(t => t.totalTons));
  const maxGap = Math.max(1, ...carriers.map(c => Math.abs(c.gapAmt || 0)));
  const maxShare = Math.max(1, ...clients.map(c => c.sharePct));
  const failed = checks.filter(c => !c.ok);

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#fff', background: NAVY, textAlign: 'center', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, color: INK, borderBottom: `1px solid ${LINE}` };
  const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  const DetailTable = ({ title, groups }: { title: string; groups: typeof detail.tankByCarrier }) => (
    <div style={{ marginTop: 14, breakInside: 'avoid' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 6 }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>운송사</th><th style={{ ...th, textAlign: 'left' }}>거래처</th><th style={th}>단가</th>
              <th style={th}>{meta.prevLabel} 대수</th><th style={th}>톤</th><th style={th}>금액</th>
              <th style={th}>{meta.periodLabel} 대수</th><th style={th}>톤</th><th style={th}>금액</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <>
                {g.rows.map((r, ri) => (
                  <tr key={`${gi}-${ri}`}>
                    <td style={{ ...td, fontWeight: ri === 0 ? 700 : 400 }}>{ri === 0 ? g.carrier : ''}</td>
                    <td style={td}>{r.client}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{won(r.unitPrice)}</td>
                    <td style={{ ...tdR, color: SOFT }}>{r.prev?.trips ?? '-'}</td><td style={{ ...tdR, color: SOFT }}>{r.prev ? ton(r.prev.tons) : '-'}</td><td style={{ ...tdR, color: SOFT }}>{r.prev ? won(r.prev.amount) : '-'}</td>
                    <td style={tdR}>{r.cur?.trips ?? '-'}</td><td style={tdR}>{r.cur ? ton(r.cur.tons) : '-'}</td><td style={{ ...tdR, fontWeight: 700 }}>{r.cur ? won(r.cur.amount) : '-'}</td>
                  </tr>
                ))}
                <tr key={`sub-${gi}`} style={{ background: '#f1f5f9' }}>
                  <td style={{ ...td, fontWeight: 800 }} colSpan={3}>{g.carrier} 소계</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{g.subtotalPrev.trips}</td><td style={{ ...tdR, fontWeight: 700 }}>{ton(g.subtotalPrev.tons)}</td><td style={{ ...tdR, fontWeight: 700 }}>{won(g.subtotalPrev.amount)}</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{g.subtotalCur.trips}</td><td style={{ ...tdR, fontWeight: 800 }}>{ton(g.subtotalCur.tons)}</td><td style={{ ...tdR, fontWeight: 800, color: NAVY }}>{won(g.subtotalCur.amount)}</td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 overflow-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* 툴바 */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12, background: 'rgba(15,23,42,.6)' }}>
        {isAdmin && <button onClick={() => window.print()} style={{ padding: '10px 20px', fontSize: 15, fontWeight: 800, background: '#fff', color: NAVY, border: 'none', borderRadius: 10, cursor: 'pointer' }}>인쇄 / PDF</button>}
        <button onClick={onClose} style={{ padding: '10px 20px', fontSize: 15, fontWeight: 800, background: '#475569', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' }}>닫기</button>
      </div>

      <div id="analysis-doc" style={{ maxWidth: 900, margin: '0 auto 40px', background: '#fff', padding: '36px 40px', fontFamily: "'Pretendard','Malgun Gothic',sans-serif" }}>
        {/* 표지 */}
        <div style={{ borderBottom: `3px solid ${NAVY}`, paddingBottom: 16, marginBottom: 22 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: SOFT, letterSpacing: '.1em' }}>MONTHLY REPORT · {meta.supplier}</div>
          <h1 style={{ fontSize: 27, fontWeight: 900, color: INK, margin: '8px 0 4px' }}>{meta.company} · {meta.periodLabel} 운송비 집행 보고</h1>
          <div style={{ fontSize: 13, color: SOFT }}>보고일 {meta.reportDate} · 대상기간 {meta.periodLabel}</div>
          {failed.length > 0 && isAdmin && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: RED, fontWeight: 700 }}>⚠ 자체검증 {failed.length}건 불일치 — 관리자 확인 필요 ({failed.map(f => f.id).join(', ')})</div>
          )}
        </div>

        {/* KPI 5카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 24 }} className="kpi-grid">
          {[
            { l: '총 운송비 (VAT별도)', v: mil(kpi.freightTotal), sub: <Pill v={kpi.mom.freightPct} /> },
            { l: '총 운송량', v: ton(kpi.totalTons) + ' 톤', sub: <Pill v={kpi.mom.tonsPct} /> },
            { l: '청구총액 (VAT포함)', v: mil(kpi.billedTotal), sub: <span style={{ fontSize: 12, color: SOFT }}>운송+컨설팅+VAT</span> },
            { l: '실행단가 (탱크로리)', v: '₩' + kpi.tankRatePerTon.toLocaleString('ko-KR') + '/톤', sub: <Pill v={kpi.mom.ratePct} /> },
            { l: '운행 대수', v: kpi.vehicleCount.toLocaleString('ko-KR') + ' 대', sub: <span style={{ fontSize: 12, color: SOFT }}>탱크{kpi.breakdown.tank.trips + kpi.breakdown.goods.trips}·카고{kpi.breakdown.cargo.trips}</span> },
          ].map((k, i) => (
            <div key={i} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '12px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: SOFT, fontWeight: 700, marginBottom: 4 }}>{k.l}</div>
              <div style={{ fontSize: 19, fontWeight: 900, color: NAVY, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{k.v}</div>
              <div>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* 01 핵심 요약 */}
        <SectionTitle no="01" ko="핵심 요약" en="Executive Summary" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {summary.insights.map((ins, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, border: `1px solid ${LINE}`, borderRadius: 8, padding: '10px 12px', breakInside: 'avoid' }}>
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: '#fff', background: ins.tag === '감소' ? RED : ins.tag === '증가' ? BLUE : ins.tag === '집중도' ? NAVY : '#6b7280', borderRadius: 5, padding: '3px 8px', height: 'fit-content' }}>{ins.tag}</span>
              <div><div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{ins.head}</div><div style={{ fontSize: 12.5, color: SOFT, marginTop: 2 }}>{ins.body}</div></div>
            </div>
          ))}
          {summary.operationalNotes.map((n, i) => (
            <div key={'op' + i} style={{ display: 'flex', gap: 10, border: `1px solid ${LINE}`, borderRadius: 8, padding: '10px 12px' }}>
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: '#fff', background: '#6b7280', borderRadius: 5, padding: '3px 8px', height: 'fit-content' }}>운영</span>
              <div style={{ fontSize: 12.5, color: SOFT }}>{n}</div>
            </div>
          ))}
        </div>

        {/* 02 월별 추이 */}
        <SectionTitle no="02" ko="월별 추이" en={trend.length > 1 ? `${trend[0].month} – ${trend[trend.length - 1].month}` : ''} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }} className="trend-grid">
          <TrendBars title="월별 운송비 (백만원)" data={trend.map(t => ({ label: t.month.slice(5), v: t.freightTotal / 1_000_000 }))} max={maxTrendFreight / 1_000_000} color={BLUE} fmt={v => v.toFixed(0)} />
          <TrendBars title="월별 운송량 (톤)" data={trend.map(t => ({ label: t.month.slice(5), v: t.totalTons }))} max={maxTrendTons} color="#0d9488" fmt={v => (v / 1000).toFixed(1) + 'k'} />
        </div>

        {/* 03 운송사 · 거래처 */}
        <SectionTitle no="03" ko="운송사 · 거래처 분석" en={`전월 대비 / ${meta.periodLabel} 비중`} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }} className="trend-grid">
          {/* 운송사 다이버징 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 8 }}>운송사별 운송비 증감 (백만원)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {carriers.filter(c => c.gapAmt != null).map((c, i) => {
                const g = c.gapAmt || 0; const w = (Math.abs(g) / maxGap) * 46;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 11.5 }}>
                    <span style={{ width: 42, textAlign: 'right', color: SOFT, fontWeight: 700 }}>{c.name}</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', margin: '0 6px' }}>
                      <div style={{ width: '50%', display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: `${g < 0 ? w : 0}%`, height: 13, background: RED, borderRadius: '3px 0 0 3px' }} /></div>
                      <div style={{ width: 1, height: 15, background: '#cbd5e1' }} />
                      <div style={{ width: '50%' }}><div style={{ width: `${g > 0 ? w : 0}%`, height: 13, background: BLUE, borderRadius: '0 3px 3px 0' }} /></div>
                    </div>
                    <span style={{ width: 62, textAlign: 'right', fontWeight: 800, color: g < 0 ? RED : BLUE, fontVariantNumeric: 'tabular-nums' }}>{g >= 0 ? '+' : '−'}{mil(Math.abs(g)).replace('₩', '')}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* 거래처 집중도 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 8 }}>탱크로리 거래처별 비중 (상위4 {con.top4Pct.toFixed(1)}%)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {clients.slice(0, 8).map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 11.5, gap: 6 }}>
                  <span style={{ width: 72, color: INK, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${(c.sharePct / maxShare) * 100}%`, height: '100%', background: NAVY }} /></div>
                  <span style={{ width: 42, textAlign: 'right', fontWeight: 800, color: NAVY }}>{c.sharePct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ▼▼▼ 관리자 전용: 인보이스 대사 + 정산 상세 부속서 ▼▼▼ */}
        {isAdmin ? (
          <>
            {/* 04 인보이스 대사 */}
            <SectionTitle no="04" ko="청구내역 검증" en="Reconciliation" />
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
              {[
                { l: `운송료 (탱크${(kpi.breakdown.tank.amount + kpi.breakdown.goods.amount) / 1e6 | 0}백만 + 카고${kpi.breakdown.cargo.amount / 1e6 | 0}백만)`, v: won(rec.freight) },
                { l: '공급가액 (VAT 별도)', v: won(rec.supply), strong: true },
                { l: `부가가치세 (${(meta.vatRate * 100).toFixed(0)}%)`, v: won(rec.vat) },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: `1px solid ${LINE}`, background: r.strong ? '#f8fafc' : '#fff', fontWeight: r.strong ? 800 : 500, fontSize: 13.5 }}>
                  <span style={{ color: INK }}>{r.l}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: INK }}>{r.v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: NAVY, color: '#fff', fontWeight: 900, fontSize: 16 }}>
                <span>청구 총액 (VAT 포함)</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{won(rec.billedTotal)}</span>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: SOFT, lineHeight: 1.7, marginBottom: 24 }}>
              <div>※ 상차도 {ton(vn.selfLoadTons)}톤은 운임 미발생(자가상차) 물량으로 운송량엔 포함되나 운송금액에서 제외됩니다. 실 운임 물량은 {ton(vn.billableTons)}톤입니다.</div>
            </div>

            {/* 05 정산 상세 부속서 */}
            <SectionTitle no="05" ko="정산 상세 명세 (부속서)" en={`${meta.prevLabel} vs ${meta.periodLabel}`} />
            <DetailTable title="탱크로리" groups={detail.tankByCarrier} />
            {detail.goods.length > 0 && <DetailTable title="상품 (금호)" groups={detail.goods} />}
            {/* BCT 합계 */}
            <div style={{ marginTop: 12, background: '#eef2f6', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: NAVY }}>
              <span>BCT 합계 (탱크+상품)</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{detail.bctTotal.cur.trips}대 · {ton(detail.bctTotal.cur.tons)}톤 · {won(detail.bctTotal.cur.amount)}</span>
            </div>
            {/* 카고 독립 섹션 */}
            {detail.cargo.length > 0 && (
              <div style={{ marginTop: 16, breakInside: 'avoid' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 6 }}>카고트럭 <span style={{ fontSize: 11, color: SOFT, fontWeight: 500 }}>(트립당 정액 단가)</span></div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={{ ...th, textAlign: 'left' }}>운송사</th><th style={{ ...th, textAlign: 'left' }}>거래처</th><th style={th}>단가(트립)</th><th style={th}>대수</th><th style={th}>톤</th><th style={th}>금액</th></tr></thead>
                  <tbody>
                    {detail.cargo.map((r, i) => (
                      <tr key={i}><td style={td}>{r.carrier}</td><td style={td}>{r.client}</td><td style={{ ...td, textAlign: 'center' }}>{won(r.unitPrice)}</td><td style={tdR}>{r.cur?.trips ?? '-'}</td><td style={tdR}>{r.cur ? ton(r.cur.tons) : '-'}</td><td style={{ ...tdR, fontWeight: 700 }}>{r.cur ? won(r.cur.amount) : '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* 자체검증 */}
            <div style={{ marginTop: 20, fontSize: 11.5 }}>
              <div style={{ fontWeight: 800, color: SOFT, marginBottom: 4 }}>자체검증</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {checks.map(c => (
                  <span key={c.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: c.ok ? '#e7f6ec' : '#fdeceb', color: c.ok ? '#15803d' : RED, fontWeight: 700 }} title={c.detail}>{c.ok ? '✓' : '✕'} {c.id} {c.label}</span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 8, padding: '14px 16px', background: '#f8fafc', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12.5, color: SOFT }}>
            청구내역 검증(Reconciliation)·정산 상세 명세(부속서)는 <b>관리자(하멜코리아)</b> 계정에서 확인할 수 있습니다.
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #analysis-doc { max-width: none !important; margin: 0 !important; padding: 12mm !important; }
          @page { size: A4; margin: 0; }
        }
        @media (max-width: 720px) { .kpi-grid { grid-template-columns: repeat(2,1fr) !important; } .trend-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

function SectionTitle({ no, ko, en }: { no: string; ko: string; en: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: `2px solid ${NAVY}`, paddingBottom: 6, marginBottom: 14, breakAfter: 'avoid' }}>
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: RED }}>{no}</span>
      <span style={{ fontSize: 17, fontWeight: 800, color: INK }}>{ko}</span>
      <span style={{ fontSize: 12, color: SOFT }}>{en}</span>
    </div>
  );
}

function TrendBars({ title, data, max, color, fmt }: { title: string; data: { label: string; v: number }[]; max: number; color: string; fmt: (v: number) => string }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130, borderBottom: `1px solid ${LINE}`, paddingBottom: 0 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: color, marginBottom: 2 }}>{fmt(d.v)}</span>
            <div style={{ width: '78%', height: `${Math.max(2, (d.v / max) * 100)}%`, background: color, borderRadius: '3px 3px 0 0', opacity: i === data.length - 1 ? 1 : 0.72 }} />
            <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
