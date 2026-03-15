'use client';

/**
 * 성적서 출력 컴포넌트
 * 기존 데스크톱 앱의 11종 성적서 양식 중 기본 양식 구현
 */

interface ReportPrintProps {
  report: {
    report_number: string;
    report_date: string;
    product_name?: string;
    product_code?: string;
    customer_name?: string;
    template_type: number;
    test_results: Record<string, string | number>;
    inspector?: string;
    approved_by?: string;
    memo?: string;
    status: string;
  };
  onClose: () => void;
}

export default function ReportPrint({ report, onClose }: ReportPrintProps) {
  const handlePrint = () => {
    window.print();
  };

  const today = new Date();
  const formattedDate = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  // 시험 결과를 테이블 행으로 변환
  const testEntries = Object.entries(report.test_results || {});

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center overflow-auto py-8">
      {/* 인쇄 버튼 */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-[210]">
        <button
          onClick={handlePrint}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          인쇄
        </button>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium"
        >
          닫기
        </button>
      </div>

      {/* 성적서 본문 */}
      <div className="bg-white w-[210mm] min-h-[297mm] p-12 shadow-2xl print:shadow-none print:p-8" id="print-area">
        {/* 상단 로고/정보 */}
        <div className="flex justify-between items-start mb-2">
          <div className="text-sm text-gray-500">
            <p>양식 제{report.template_type}호</p>
          </div>
          <div className="text-sm text-gray-500">
            <p>문서번호: {report.report_number}</p>
          </div>
        </div>

        {/* 제목 */}
        <div className="text-center border-b-2 border-black pb-4 mb-8">
          <h1 className="text-3xl font-bold tracking-[0.5em]">시험성적서</h1>
          <p className="text-sm text-gray-500 mt-1">TEST REPORT</p>
        </div>

        {/* 기본 정보 */}
        <table className="w-full border-collapse border border-gray-800 text-sm mb-6">
          <tbody>
            <tr>
              <td className="border border-gray-800 bg-gray-100 px-4 py-2.5 font-semibold w-28">성적서번호</td>
              <td className="border border-gray-800 px-4 py-2.5">{report.report_number}</td>
              <td className="border border-gray-800 bg-gray-100 px-4 py-2.5 font-semibold w-28">발행일자</td>
              <td className="border border-gray-800 px-4 py-2.5">{report.report_date}</td>
            </tr>
            <tr>
              <td className="border border-gray-800 bg-gray-100 px-4 py-2.5 font-semibold">제품코드</td>
              <td className="border border-gray-800 px-4 py-2.5">{report.product_code || '-'}</td>
              <td className="border border-gray-800 bg-gray-100 px-4 py-2.5 font-semibold">제품명</td>
              <td className="border border-gray-800 px-4 py-2.5">{report.product_name || '-'}</td>
            </tr>
            <tr>
              <td className="border border-gray-800 bg-gray-100 px-4 py-2.5 font-semibold">납품처</td>
              <td className="border border-gray-800 px-4 py-2.5" colSpan={3}>{report.customer_name || '-'}</td>
            </tr>
          </tbody>
        </table>

        {/* 시험 결과 */}
        <h2 className="text-base font-bold mb-3 border-b border-gray-300 pb-2">시험 결과</h2>
        <table className="w-full border-collapse border border-gray-800 text-sm mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-800 px-4 py-2 w-12">No</th>
              <th className="border border-gray-800 px-4 py-2">시험항목</th>
              <th className="border border-gray-800 px-4 py-2 w-40">시험결과</th>
            </tr>
          </thead>
          <tbody>
            {testEntries.length > 0 ? (
              testEntries.map(([key, value], index) => (
                <tr key={key}>
                  <td className="border border-gray-800 px-4 py-2 text-center">{index + 1}</td>
                  <td className="border border-gray-800 px-4 py-2">{key}</td>
                  <td className="border border-gray-800 px-4 py-2 text-center">{String(value)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="border border-gray-800 px-4 py-8 text-center text-gray-400" colSpan={3}>
                  시험 결과가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 비고 */}
        {report.memo && (
          <div className="mb-6">
            <h2 className="text-base font-bold mb-2 border-b border-gray-300 pb-2">비고</h2>
            <p className="text-sm whitespace-pre-wrap">{report.memo}</p>
          </div>
        )}

        {/* 판정 */}
        <div className="text-center my-8 py-4 border-2 border-gray-800">
          <span className="text-lg font-bold">
            판정: {report.status === 'approved' || report.status === 'issued' ? '합격' : '검토중'}
          </span>
        </div>

        {/* 하단 */}
        <div className="mt-12 text-sm">
          <p className="text-center mb-8">
            상기와 같이 시험성적서를 발행합니다.
          </p>
          <p className="text-center mb-8">{formattedDate}</p>

          {/* 서명란 */}
          <div className="flex justify-center gap-16 mt-8">
            <div className="text-center">
              <p className="mb-2">시험자</p>
              <div className="w-24 h-16 border-b border-gray-800"></div>
              <p className="mt-1 text-xs">{report.inspector || ''}</p>
            </div>
            <div className="text-center">
              <p className="mb-2">승인자</p>
              <div className="w-24 h-16 border-b border-gray-800"></div>
              <p className="mt-1 text-xs">{report.approved_by || ''}</p>
            </div>
          </div>

          {/* 발행처 */}
          <div className="text-center mt-12">
            <p className="text-lg font-bold">경기광업 주식회사</p>
            <p className="text-xs text-gray-500 mt-1">GYEONGGI MINING CO., LTD.</p>
          </div>
        </div>
      </div>

      {/* 인쇄 스타일 */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 20mm !important;
          }
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
