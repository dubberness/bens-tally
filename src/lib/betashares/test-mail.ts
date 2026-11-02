/** Made-up Betashares emails for tests. Nothing here is real. */

export interface TestMailOptions {
	from?: string;
	subject?: string;
	body?: string;
	/** Authentication-Results lines, top first. */
	auth?: string[];
	messageId?: string;
}

export const PASS =
	'mx.cloudflare.net; dkim=pass header.d=betashares.com.au; dmarc=pass header.from=betashares.com.au';

export function tradeBody(
	o: {
		orderId?: string;
		side?: string;
		ticker?: string;
		date?: string;
		price?: string;
		qty?: string;
		value?: string;
	} = {}
) {
	const t = o.ticker ?? 'VAS';
	return [
		`Your ${o.side ?? 'buy'} order has been filled`,
		`Order ID: ${o.orderId ?? 'AAAA1111-2222-3333-4444-555566667777'}`,
		`${t} Logo`,
		t,
		'Test Australian Shares ETF',
		`Your order filled at Wednesday, ${o.date ?? '28 October 2026'} (AEDT)`,
		`Average price $${o.price ?? '100.00'}`,
		`Quantity ${o.qty ?? '2.5'}`,
		`Value $${o.value ?? '250.00'}`,
		`Total $${o.value ?? '250.00'}`
	].join('\n');
}

export function incomeBody(
	o: { date?: string; lines?: [string, string, string, string][]; cash?: boolean } = {}
) {
	const lines = o.lines ?? [['VAS', '0.2500', '100.000000', '25.00']];
	const total = lines.reduce((s, l) => s + Number(l[3]), 0).toFixed(2);
	return [
		`Here are the distributions paid on ${o.date ?? '16/10/2026'}.`,
		'Summary of distributions',
		o.cash === false
			? 'The below will be reinvested in units:'
			: 'The below will be retained as cash:',
		...lines.map((l) => `${l[0]} $${l[1]} ${l[2]} $${l[3]}`),
		`Distribution Total $${total}`
	].join('\n');
}

export function testMail(o: TestMailOptions = {}): string {
	const headers = [
		...(o.auth ?? [PASS]).map((a) => `Authentication-Results: ${a}`),
		`From: Betashares <${o.from ?? 'orders@notification.betashares.com.au'}>`,
		'To: import@example.com',
		`Subject: ${o.subject ?? 'Your buy order for VAS has been filled'}`,
		`Message-ID: <${o.messageId ?? Math.random().toString(36).slice(2)}@example.com>`,
		'Content-Type: text/plain; charset=utf-8'
	];
	return headers.join('\r\n') + '\r\n\r\n' + (o.body ?? tradeBody()).replace(/\n/g, '\r\n');
}
