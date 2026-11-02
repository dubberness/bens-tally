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
