/**
 * 배차통보 카카오 알림톡 발송 API (Solapi)
 *
 * POST /api/notify/kakao
 * Body: { shipments: [...], customerMap: { customerId: { name, phone } } }
 *
 * 환경변수:
 *   SOLAPI_API_KEY      — Solapi API Key
 *   SOLAPI_API_SECRET   — Solapi API Secret
 *   SOLAPI_PFID         — 카카오 채널 ID (플러스친구 @아이디)
 *   SOLAPI_TEMPLATE_ID  — 알림톡 템플릿 ID (Solapi 콘솔에서 등록 후 발급)
 *   SOLAPI_SENDER_PHONE — SMS 대체발송용 발신번호 (01012345678 형식)
 *
 * 알림톡 실패 시 SMS로 대체 발송됩니다.
 *
 * Solapi 가입: https://solapi.com
 * 알림톡 템플릿 등록 가이드: https://docs.solapi.com/kakao/alimtalk
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const API_KEY = process.env.SOLAPI_API_KEY || '';
const API_SECRET = process.env.SOLAPI_API_SECRET || '';
const PFID = process.env.SOLAPI_PFID || '';
const TEMPLATE_ID = process.env.SOLAPI_TEMPLATE_ID || '';
const SENDER_PHONE = process.env.SOLAPI_SENDER_PHONE || '';

const SOLAPI_API_URL = 'https://api.solapi.com/messages/v4/send-many';

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
  phone: string;
}

interface RequestBody {
  shipments: ShipmentInfo[];
  customerMap: Record<string, CustomerContact>;
}

/** 전화번호 정규화 (하이픈 제거, 국가번호 처리) */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('82')) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
}

/** 유효 휴대폰 여부 — 상차도 더미번호(111-1111-1111 등)·잘못된 번호 발송 차단 */
function isValidMobile(normalized: string): boolean {
  if (!/^01[016789]\d{7,8}$/.test(normalized)) return false; // 010/011… 형식만
  if (/^(\d)\1+$/.test(normalized)) return false;            // 1111111… 같은 반복 더미
  return true;
}

/** Solapi HMAC 인증 헤더 생성 */
function getSolapiAuthHeader(): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(date + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
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

/** 출하 건별 내역 라인 (알림톡 #{내용} 변수에 들어가는 본문) */
function buildItemLines(shipments: ShipmentInfo[]): string {
  return shipments.map((s, i) =>
    `${i + 1}. ${s.product_name || '-'} / ${s.company_name || '-'} / ${s.vehicle_number || '-'}${s.driver_name ? ` (${s.driver_name})` : ''}`
  ).join('\n');
}

/** SMS 대체발송용 전체 본문 (알림톡 실패 시 문자로 나가는 내용) */
function buildMessageText(customerName: string, shipments: ShipmentInfo[]): string {
  const date = shipments[0]?.shipment_date || new Date().toISOString().slice(0, 10);
  return [
    `[경기광업 배차통보]`,
    ``,
    `${customerName}님, ${date} 배차가 아래와 같이 통보되었습니다.`,
    ``,
    buildItemLines(shipments),
    ``,
    `총 ${shipments.length}건`,
    `문의: kgmn@hmlkorea.com`,
  ].join('\n');
}

export async function GET(request: NextRequest) {
  const configured = !!(API_KEY && API_SECRET && PFID);
  const base = {
    configured,
    hasTemplate: !!TEMPLATE_ID,
    hasSenderPhone: !!SENDER_PHONE,
    pfid: PFID || '(미설정)',
  };

  // ?detail=1 → 승인된 템플릿의 실제 변수/본문 조회(변수 매칭 검증용, 시크릿은 노출 안 함)
  const wantDetail = request.nextUrl.searchParams.get('detail');
  if (wantDetail && API_KEY && API_SECRET && TEMPLATE_ID) {
    try {
      const res = await fetch(`https://api.solapi.com/kakao/v2/templates/${TEMPLATE_ID}`, {
        headers: { Authorization: getSolapiAuthHeader() },
      });
      const t = await res.json();
      if (!res.ok) return NextResponse.json({ ...base, detailError: t.errorMessage || t.message || JSON.stringify(t) });
      const content: string = t.content || '';
      const tokens = [...new Set((content.match(/#\{[^}]+\}/g) || []))];
      return NextResponse.json({
        ...base,
        template: {
          name: t.name, status: t.status, buttons: (t.buttons || []).map((b: { buttonName?: string }) => b.buttonName),
          variables: tokens, content,
        },
      });
    } catch (e) {
      return NextResponse.json({ ...base, detailError: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json(base);
}

export async function POST(request: NextRequest) {
  // 설정 확인
  if (!API_KEY || !API_SECRET) {
    return NextResponse.json(
      { error: 'Solapi 설정이 필요합니다. SOLAPI_API_KEY, SOLAPI_API_SECRET를 등록하세요.' },
      { status: 400 },
    );
  }
  // 발송 채널(알림톡 or 문자) 미설정 → 명확히 안내 (수신자 유무와 무관한 설정 문제)
  const canAlimtalk = !!(PFID && TEMPLATE_ID);
  const canSms = !!SENDER_PHONE;
  if (!canAlimtalk && !canSms) {
    return NextResponse.json(
      { error: '배차통보 발송 채널이 설정되지 않았습니다. 알림톡(pfId·템플릿ID) 승인·등록 또는 문자 발신번호(SOLAPI_SENDER_PHONE)를 운영에 등록해야 발송됩니다.' },
      { status: 400 },
    );
  }

  try {
    const body: RequestBody = await request.json();
    const { shipments, customerMap } = body;

    if (!shipments?.length) {
      return NextResponse.json({ error: '발송할 출하 데이터가 없습니다.' }, { status: 400 });
    }

    // 거래처별 그룹핑
    const groups = groupByCustomer(shipments);
    const messages: Record<string, unknown>[] = [];
    const noPhoneResults: { customerId: string; customerName: string; error: string }[] = [];

    for (const [customerId, items] of Object.entries(groups)) {
      const contact = customerMap[customerId];
      if (!contact?.phone) {
        noPhoneResults.push({
          customerId,
          customerName: items[0]?.customer_name || '(알 수 없음)',
          error: '전화번호가 등록되지 않았습니다.',
        });
        continue;
      }

      const phone = normalizePhone(contact.phone);
      if (!isValidMobile(phone)) {
        noPhoneResults.push({
          customerId,
          customerName: contact.name || items[0]?.customer_name || '(알 수 없음)',
          error: '유효한 휴대폰 번호가 아닙니다(상차도/미등록). 통보 대상에서 제외됨.',
        });
        continue;
      }
      const text = buildMessageText(contact.name, items);

      if (PFID && TEMPLATE_ID) {
        // 알림톡 발송 (실패 시 SMS 대체)
        const msg: Record<string, unknown> = {
          to: phone,
          kakaoOptions: {
            pfId: PFID,
            templateId: TEMPLATE_ID,
            variables: {
              '#{고객명}': contact.name,
              '#{날짜}': items[0]?.shipment_date || '',
              '#{내용}': buildItemLines(items), // 건별 내역만 (템플릿 프레임은 승인문구에)
              '#{건수}': String(items.length),
            },
          },
        };

        // SMS 대체 발송 설정
        if (SENDER_PHONE) {
          msg.from = SENDER_PHONE;
          msg.text = text;
          msg.type = 'ATA'; // 알림톡
        }

        messages.push(msg);
      } else if (SENDER_PHONE) {
        // 알림톡 템플릿 미등록 → SMS 직접 발송
        messages.push({
          to: phone,
          from: SENDER_PHONE,
          text,
          type: 'LMS', // 장문문자 (긴 내용)
        });
      } else {
        noPhoneResults.push({
          customerId,
          customerName: contact.name,
          error: 'SOLAPI_PFID/TEMPLATE_ID 또는 SOLAPI_SENDER_PHONE이 설정되지 않았습니다.',
        });
      }
    }

    // 발송할 메시지가 없는 경우
    if (messages.length === 0) {
      return NextResponse.json({
        success: false,
        message: '발송 가능한 대상이 없습니다.',
        results: noPhoneResults.map(r => ({ ...r, success: false })),
      });
    }

    // Solapi API 호출
    const authHeader = getSolapiAuthHeader();
    const response = await fetch(SOLAPI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({ messages }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Solapi API 오류: ${result.errorMessage || result.message || JSON.stringify(result)}`,
        results: noPhoneResults.map(r => ({ ...r, success: false })),
      }, { status: 500 });
    }

    // Solapi send-many 응답은 그룹 객체를 그대로 반환(count가 최상위). groupInfo 하위가 아님.
    const cnt = result.count || result.groupInfo?.count || {};
    const successCount = cnt.registeredSuccess ?? cnt.total ?? messages.length;
    const sendFailed = cnt.registeredFailed ?? 0;
    const failCount = sendFailed + noPhoneResults.length;
    const failedList = Array.isArray(result.failedMessageList) ? result.failedMessageList : [];

    return NextResponse.json({
      success: failCount === 0,
      message: `카카오톡 발송 완료: 성공 ${successCount}건, 실패 ${failCount}건`,
      solapiResult: { groupId: result._id || result.groupInfo?.groupId, count: cnt },
      failedList: failedList.slice(0, 20),
      noPhoneResults,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `카카오톡 발송 오류: ${errMsg}` }, { status: 500 });
  }
}
