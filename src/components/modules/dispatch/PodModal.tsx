'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';

export interface PodShipment {
  id: string;
  company_name: string | null;
  customer_name: string | null;
  product_name: string | null;
  shipment_date: string;
  weight_net: number | null;
  is_shipped: boolean | null;
  vehicle_number: string | null;
}

interface PodItem { id: string; url: string; uploaded_by: string; created_at: string; }

function locked(s: PodShipment): boolean {
  return !!s.is_shipped; // 출하확정 시에만 잠금(D+3 자동잠금 없음)
}

export default function PodModal({ shipment, isAdmin, isTransporter, onClose, onChanged }: {
  shipment: PodShipment; isAdmin: boolean; isTransporter: boolean; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [weight, setWeight] = useState<string>(shipment.weight_net != null ? String(shipment.weight_net) : '');
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const isLocked = locked(shipment);
  const canEditWeight = isAdmin || !isLocked;
  const canDelete = isAdmin || (isTransporter && !isLocked);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pod?shipmentId=${shipment.id}`);
      const j = await res.json();
      setItems(j.items || []);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [shipment.id]);
  useEffect(() => { load(); }, [load]);

  // 업로드 전 이미지 압축(긴 변 1600px, JPEG 0.7) — 스토리지 부담 최소화
  const compress = (file: File): Promise<File> => new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { width, height } = img;
      if (Math.max(width, height) > MAX) { const r = MAX / Math.max(width, height); width = Math.round(width * r); height = Math.round(height * r); }
      const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
      const ctx = cv.getContext('2d'); if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      cv.toBlob(b => {
        if (!b || b.size >= file.size) { resolve(file); return; } // 압축 이득 없으면 원본
        resolve(new File([b], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.7);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

  const addFiles = async (fs: File[]) => {
    const imgs = fs.filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    const out = await Promise.all(imgs.map(compress));
    setPicked(prev => [...prev, ...out]);
    setPreviews(prev => [...prev, ...out.map(f => URL.createObjectURL(f))]);
  };
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    await addFiles(fs);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    await addFiles(Array.from(e.dataTransfer.files || []));
  };

  // 계근수량 키패드
  const press = (k: string) => {
    if (!canEditWeight) return;
    setWeight(w => {
      if (k === '⌫') return w.slice(0, -1);
      if (k === '.') return w.includes('.') ? w : (w === '' ? '0.' : w + '.');
      if (w.includes('.') && (w.split('.')[1]?.length || 0) >= 2) return w; // 소수 2자리 제한
      if (w === '0') return k;                                              // 선행 0 대체
      if (w.replace('.', '').length >= 6) return w;                         // 과입력 방지
      return w + k;
    });
  };
  const clearWeight = () => { if (canEditWeight) setWeight(''); };
  const removePicked = (i: number) => {
    setPicked(prev => prev.filter((_, x) => x !== i));
    setPreviews(prev => { URL.revokeObjectURL(prev[i]); return prev.filter((_, x) => x !== i); });
  };

  const submit = async () => {
    if (picked.length === 0 && weight === (shipment.weight_net != null ? String(shipment.weight_net) : '')) {
      toast.warning('사진을 추가하거나 계근수량을 입력하세요.'); return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('shipmentId', shipment.id);
      if (weight.trim() !== '') fd.append('weight', weight.trim());
      picked.forEach(f => fd.append('files', f));
      const res = await fetch('/api/pod', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok || j.error) { toast.error(j.error || '증빙 저장 실패'); return; }
      previews.forEach(u => URL.revokeObjectURL(u));
      setPicked([]); setPreviews([]);
      toast.success(`증빙 ${j.uploaded || 0}장 저장${j.weightSaved ? ' · 계근 확정' : ''}`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '증빙 저장 오류');
    } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    if (!confirm('이 증빙 사진을 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/pod?id=${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || j.error) { toast.error(j.error || '삭제 실패'); return; }
      toast.success('삭제되었습니다.');
      await load(); onChanged();
    } catch { toast.error('삭제 오류'); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        {/* header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #eef1f5', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>계근 수량 입력 및 증빙</div>
            <div style={{ fontSize: 14, color: '#475569', marginTop: 3 }}>
              {shipment.customer_name || '-'} · <b>{shipment.product_name || '-'}</b> · {shipment.shipment_date?.slice(2)}
              {shipment.vehicle_number ? ` · ${shipment.vehicle_number}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, fontSize: 20, cursor: 'pointer', color: '#475569', flex: 'none' }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          {isLocked && (
            <div style={{ background: '#fbe9e7', border: '1px solid #f0a89f', color: '#7f1d1d', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, marginBottom: 14 }}>
              🔒 출하확정된 건입니다. {isAdmin ? '관리자는 계근수량도 수정 가능합니다.' : '계근수량은 잠겼지만, 증빙 사진은 계속 추가할 수 있습니다.'}
            </div>
          )}

          {/* ── 윗면: 계근수량 키패드 ── */}
          <label style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 6 }}>계근수량 (톤) — 계근증 숫자를 눌러 입력</label>
          {/* 값 표시 */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 5, padding: '11px 16px', border: '2px solid #cbd5e1', borderRadius: 11, background: canEditWeight ? '#f8fafc' : '#f1f5f9', minHeight: 52 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: weight ? '#0f172a' : '#cbd5e1', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{weight || '0'}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#64748b' }}>톤</span>
          </div>
          {canEditWeight && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 7, maxWidth: 300 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => (
                <button key={k} type="button" onClick={() => press(k)}
                  style={{ padding: '11px 0', fontSize: 20, fontWeight: 900, borderRadius: 10, border: '1px solid #e2e8f0', background: k === '⌫' ? '#fef2f2' : '#fff', color: k === '⌫' ? '#dc2626' : '#0f172a', cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.05)' }}>
                  {k}
                </button>
              ))}
              <button type="button" onClick={clearWeight}
                style={{ gridColumn: '1 / -1', padding: '8px 0', fontSize: 13.5, fontWeight: 800, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer' }}>
                전체 지우기
              </button>
            </div>
          )}

          {/* 사진 추가 */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 6 }}>증빙 사진 (출하증 도장 · 계근증 등)</div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={onPick} style={{ display: 'none' }} id="podfile" />
            <div onClick={() => !busy && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)} onDrop={onDrop}
              style={{ width: '100%', padding: '20px 16px', borderRadius: 12, border: `2px dashed ${dragging ? '#2563eb' : '#93c5fd'}`, background: dragging ? '#dbeafe' : '#eff6ff', color: '#1d4ed8', fontSize: 16, fontWeight: 800, cursor: 'pointer', textAlign: 'center', transition: 'all .12s' }}>
              📷 사진 촬영 / 선택
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#60a5fa', marginTop: 4 }}>여기로 사진을 끌어다 놓아도 됩니다</div>
            </div>

            {previews.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8, marginTop: 12 }}>
                {previews.map((u, i) => (
                  <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '1', border: '1px solid #e2e8f0' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removePicked(i)} style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(15,23,42,.7)', color: '#fff', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 아래쪽: 등록된 증빙 현황 */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#64748b', marginBottom: 8 }}>등록된 증빙 {items.length > 0 ? `(${items.length})` : ''}</div>
            {loading ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '10px 0' }}>불러오는 중…</div>
            ) : items.length === 0 ? (
              <div style={{ color: '#cbd5e1', fontSize: 13, padding: '10px 0' }}>아직 등록된 증빙이 없습니다.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                {items.map(it => (
                  <div key={it.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.url} alt="" onClick={() => setViewer(it.url)} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }} />
                    <div style={{ fontSize: 10.5, color: '#94a3b8', padding: '3px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.uploaded_by || ''}</div>
                    {canDelete && (
                      <button onClick={() => del(it.id)} style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(220,38,38,.85)', color: '#fff', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 확정 버튼 (맨 아래) */}
          <button onClick={submit} disabled={busy}
            style={{ position: 'sticky', bottom: 0, width: '100%', marginTop: 18, padding: '16px', borderRadius: 12, border: 'none', background: busy ? '#94a3b8' : '#16a34a', color: '#fff', fontSize: 19, fontWeight: 900, cursor: busy ? 'default' : 'pointer', boxShadow: '0 -2px 10px rgba(15,23,42,.08)' }}>
            {busy ? '저장 중…' : '✅ 계근 확정 · 증빙 저장'}
          </button>
        </div>
      </div>

      {/* 확대 뷰어 */}
      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  );
}
