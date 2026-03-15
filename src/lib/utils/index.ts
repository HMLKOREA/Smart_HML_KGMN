type ClassValue = string | number | boolean | undefined | null | ClassValue[] | Record<string, boolean | undefined | null>;

function clsx(...inputs: ClassValue[]): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      classes.push(input);
    } else if (typeof input === 'number') {
      classes.push(String(input));
    } else if (Array.isArray(input)) {
      const inner = clsx(...input);
      if (inner) classes.push(inner);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }
  return classes.join(' ');
}

export function cn(...inputs: ClassValue[]) {
  return clsx(...inputs);
}

export function formatDate(date: string | Date, format: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return format
    .replace('yyyy', String(year))
    .replace('MM', month)
    .replace('dd', day)
    .replace('HH', hours)
    .replace('mm', minutes);
}

export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return '';
  return num.toLocaleString('ko-KR');
}

export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return '';
  return `${amount.toLocaleString('ko-KR')}원`;
}

export function generateNumber(prefix: string, date?: Date): string {
  const d = date || new Date();
  const dateStr = formatDate(d, 'yyyyMMdd').replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dateStr}-${random}`;
}

export function getTodayString(): string {
  return formatDate(new Date(), 'yyyy-MM-dd');
}

export function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: formatDate(start, 'yyyy-MM-dd'),
    end: formatDate(end, 'yyyy-MM-dd'),
  };
}
