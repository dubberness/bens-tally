/** Money is stored and passed around as integer cents. */
export type Cents = number;

const whole = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-AU', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

export interface MoneyOptions {
	/** Show cents (default: whole dollars). */
	cents?: boolean;
	/** Always show + or − (for changes). */
	sign?: boolean;
}

/** −$1,234 uses a real minus sign so it reads well and lines up with tabular figures. */
export function formatMoney(value: Cents, opts: MoneyOptions = {}): string {
	const dollars = Math.abs(value) / 100;
	const body = opts.cents ? exact.format(dollars) : whole.format(Math.round(dollars));
	const zero = opts.cents ? value === 0 : Math.round(dollars) === 0;
	if (value < 0 && !zero) return `−$${body}`;
	if (opts.sign && !zero) return `+$${body}`;
	return `$${body}`;
}

/** Parse what someone types ("$1,234.5", "-20", "1234") into cents, or null. */
export function parseMoney(input: string): Cents | null {
	const cleaned = input.replace(/[\s,$]/g, '').replace(/^−/, '-');
	if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
	const negative = cleaned.startsWith('-');
	const [d, c = ''] = cleaned.replace('-', '').split('.');
	const cents = Number(d) * 100 + Number(c.padEnd(2, '0'));
	return negative ? -cents : cents;
}

/** Short form for tags and axis labels: $1.2k, −$150k, $1.5m. */
export function formatMoneyShort(value: Cents, opts: { sign?: boolean } = {}): string {
	const dollars = Math.abs(value) / 100;
	let body: string;
	if (dollars >= 999_500) body = `${(dollars / 1_000_000).toFixed(dollars >= 9_950_000 ? 0 : 1)}m`;
	else if (dollars >= 9_950) body = `${Math.round(dollars / 1000)}k`;
	else if (dollars >= 1000) body = `${(dollars / 1000).toFixed(1)}k`;
	else body = `${Math.round(dollars)}`;
	body = body.replace('.0k', 'k').replace('.0m', 'm');
	if (value < 0 && body !== '0') return `−$${body}`;
	if (opts.sign && body !== '0') return `+$${body}`;
	return `$${body}`;
}
