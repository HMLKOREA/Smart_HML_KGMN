'use client';

export default function ReadOnlyBanner({ message }: { message?: string }) {
  return (
    <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
      <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <span className="text-sm font-medium text-amber-800">
        {message || '조회 전용 모드입니다. 데이터 수정이 제한됩니다.'}
      </span>
    </div>
  );
}
