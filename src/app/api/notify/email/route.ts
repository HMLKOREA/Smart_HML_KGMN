/**
 * 배차통보 이메일 발송 API
 *
 * POST /api/notify/email
 * Body: { shipments: [...], customerMap: { customerId: { name, email } } }
 *
 * 환경변수:
 *   SMTP_HOST     — SMTP 서버 주소
 *   SMTP_PORT     — SMTP 포트 (기본: 587)
 *   SMTP_USER     — SMTP 인증 사용자
 *   SMTP_PASS     — SMTP 인증 비밀번호
 *   SMTP_FROM     — 발신자 이메일 (기본: SMTP_USER)
 *   SMTP_FROM_NAME — 발신자 이름 (기본: 경기광업 스마트배차)
 */
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || '경기광업 스마트배차';

interface ShipmentInfo {
  id: string;
  shipment_date: string;
  customer_id: string;
  customer_name?: string;
  product_name?: string;
  company_name?: string;
  vehicle_number?: string;
  driver_name?: string;
  quantity?: number;
  unit?: string;
  delivery_address?: string;
  notes?: string;
}

interface CustomerContact {
  name: string;
  email: string;
}

interface RequestBody {
  shipments: ShipmentInfo[];
  customerMap: Record<string, CustomerContact>;
}

/** 거래처별로 출하 건을 그룹핑 */
function groupByCustomer(shipments: ShipmentInfo[]): Record<string, ShipmentInfo[]> {
  const groups: Record<string, ShipmentInfo[]> = {};
  for (const s of shipments) {
    const key = s.customer_id;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return groups;
}

/** HTML 이메일 본문 생성 */
function buildEmailHtml(customerName: string, shipments: ShipmentInfo[]): string {
  const date = shipments[0]?.shipment_date || new Date().toISOString().slice(0, 10);
  const rows = shipments.map((s, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${i + 1}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${s.product_name || '-'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${s.company_name || '-'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${s.vehicle_number || '-'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${s.driver_name || '-'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${s.quantity ? `${s.quantity} ${s.unit || ''}` : '-'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${s.notes || ''}</td>
    </tr>
  `).join('');

  return `
    <div style="max-width:700px;margin:0 auto;font-family:'Malgun Gothic','맑은 고딕',sans-serif">
      <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 32px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">배차통보</h1>
        <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px">경기광업 스마트배차 시스템</p>
      </div>
      <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;background:#fff">
        <p style="margin:0 0 6px;font-size:15px;color:#111827">
          <strong>${customerName}</strong> 귀하
        </p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280">
          ${date} 배차가 아래와 같이 통보되었습니다.
        </p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #e5e7eb">No</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #e5e7eb">제품명</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #e5e7eb">운송사</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #e5e7eb">차량번호</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #e5e7eb">기사명</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #e5e7eb">수량</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#475569;border-bottom:2px solid #e5e7eb">비고</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <p style="margin:0;font-size:13px;color:#64748b">
            총 <strong style="color:#1d4ed8">${shipments.length}</strong>건의 배차가 통보되었습니다.
          </p>
        </div>

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af">
            본 메일은 경기광업 스마트배차 시스템에서 자동 발송되었습니다.<br>
            문의: kgmn@hmlkorea.com | HAMEL KOREA CO., LTD
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function GET() {
  const configured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
  return NextResponse.json({
    configured,
    host: SMTP_HOST || '(미설정)',
    from: SMTP_FROM || '(미설정)',
  });
}

export async function POST(request: NextRequest) {
  // 설정 확인
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return NextResponse.json(
      { error: 'SMTP 설정이 필요합니다. .env.local에 SMTP_HOST, SMTP_USER, SMTP_PASS를 설정하세요.' },
      { status: 400 },
    );
  }

  try {
    const body: RequestBody = await request.json();
    const { shipments, customerMap } = body;

    if (!shipments?.length) {
      return NextResponse.json({ error: '발송할 출하 데이터가 없습니다.' }, { status: 400 });
    }

    // SMTP transporter 생성
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false },
    });

    // 거래처별 그룹핑
    const groups = groupByCustomer(shipments);
    const results: { customerId: string; customerName: string; email: string; success: boolean; error?: string }[] = [];

    for (const [customerId, items] of Object.entries(groups)) {
      const contact = customerMap[customerId];
      if (!contact?.email) {
        results.push({
          customerId,
          customerName: items[0]?.customer_name || '(알 수 없음)',
          email: '',
          success: false,
          error: '이메일 주소가 등록되지 않았습니다.',
        });
        continue;
      }

      const date = items[0]?.shipment_date || new Date().toISOString().slice(0, 10);
      const subject = `[경기광업] ${date} 배차통보 (${items.length}건)`;
      const html = buildEmailHtml(contact.name, items);

      try {
        await transporter.sendMail({
          from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
          to: contact.email,
          subject,
          html,
        });
        results.push({ customerId, customerName: contact.name, email: contact.email, success: true });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({ customerId, customerName: contact.name, email: contact.email, success: false, error: errMsg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: failCount === 0,
      message: `이메일 발송 완료: 성공 ${successCount}건, 실패 ${failCount}건`,
      results,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `이메일 발송 오류: ${errMsg}` }, { status: 500 });
  }
}
