import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { incomeBody, testMail, tradeBody } from '$lib/betashares/test-mail';
import { fakeD1 } from '../../../../worker/src/fake-d1';
import { api, receive, type Env } from '../../../../worker/src/index';
import { db, schema } from '../db';
import { mailWorker } from '../env';
import { collectEmails, emailStatus } from './email';
import { inboxItems, resolveItem } from './inbox';
import { editsOf, findDistribution } from './records';

const now = new Date('2026-10-30T00:00:00Z');

// The app talks to a real Worker (over a fake D1) through this fetch.
const worker: Env = {
	DB: fakeD1(),
	APP_TOKEN: 'test-token',
	IMPORT_ADDRESS: 'import@example.com',
	ALLOWED_SENDERS: 'orders@notification.betashares.com.au,updates@account.betashares.com.au',
	SENDER_DOMAIN: 'betashares.com.au',
	TRUSTED_AUTHSERV: 'mx.cloudflare.net'
};
const fetcher = ((url: string, init?: RequestInit) =>
	api(new Request(url, init), worker)) as unknown as typeof fetch;
const mail = (raw: string) =>
	receive(
		{
			from: 'fwd@example.com',
			to: 'import@example.com',
			rawSize: raw.length,
			raw: new Response(raw).body!
		},
		worker
	);
mailWorker.url = 'https://worker.example';
mailWorker.token = 'test-token';

describe('Betashares emails into the app', () => {
	const fund = db
		.insert(schema.instruments)
		.values({ ticker: 'VAS', createdAt: now, updatedAt: now })
		.returning()
		.get();
	// What the sheet import left: a trade with no order ID and a distribution marked reinvested.
	const sheetTrade = db
		.insert(schema.trades)
		.values({
			instrumentId: fund.id,
			date: '2026-10-28',
			side: 'buy',
			unitsE6: 2_500_000,
			priceE4: 1_000_000,
			valueCents: 25_000,
			source: 'sheet',
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	const sheetDist = db
		.insert(schema.distributions)
		.values({
			instrumentId: fund.id,
			date: '2026-10-19',
			amountCents: 2500,
			reinvested: true,
			source: 'sheet',
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();

	it('collects, matches, adds and sorts out each email', async () => {
		await mail(testMail({ body: tradeBody({ orderId: 'AAAA1111-0000-0000-0000-000000000001' }) }));
		await mail(
			testMail({
				subject: 'Your buy order for NEWF has been filled',
				body: tradeBody({
					orderId: 'AAAA1111-0000-0000-0000-000000000002',
					ticker: 'NEWF',
					date: '29 October 2026',
					price: '20.00',
					qty: '5',
					value: '100.00'
				})
			})
		);
		await mail(
			testMail({
				from: 'updates@account.betashares.com.au',
				subject: "You've received income of $25.00",
				body: incomeBody({ date: '16/10/2026' })
			})
		);
		await mail(testMail({ subject: 'Your auto-invest is coming up', body: 'Reminder' }));
		await mail(testMail({ subject: 'Something new from Betashares', body: 'Hello' }));
		await mail(testMail({ from: 'someone@example.org' }));

		expect(await collectEmails(now, fetcher)).toBe('5 new emails stored.');

		const trades = db.select().from(schema.trades).all();
		expect(trades.find((t) => t.id === sheetTrade.id)!.orderId).toBe(
			'AAAA1111-0000-0000-0000-000000000001'
		);
		const added = trades.find((t) => t.source === 'email')!;
		expect(added).toMatchObject({ unitsE6: 5_000_000, valueCents: 10_000, date: '2026-10-29' });
		expect(added.importItemId).not.toBeNull();
		const newFund = db
			.select()
			.from(schema.instruments)
			.where(eq(schema.instruments.ticker, 'NEWF'))
			.get()!;
		expect(newFund.name).toBe('Test Australian Shares ETF');
		expect(
			db.select().from(schema.prices).where(eq(schema.prices.instrumentId, newFund.id)).get()
		).toMatchObject({ closeE4: 200_000, source: 'email' });

		const { review, done } = inboxItems();
		expect(review.map((i) => (i.result as { kind: string }).kind).sort()).toEqual([
			'income',
			'unknown'
		]);
		expect(done.map((i) => i.status).sort()).toEqual(['applied', 'applied', 'ignored']);

		const st = emailStatus();
		expect(st.worker).toMatchObject({ pending: 0, rejected: 1 });
		expect(st.lastEmailAt).not.toBeNull();

		// Nothing new the second time.
		expect(await collectEmails(now, fetcher)).toBe('No new emails.');
	});

	it("uses the email's date and cash setting for a distribution when Ben says so", () => {
		const item = inboxItems().review.find((i) => (i.result as { kind: string }).kind === 'income')!;
		const line = (item.result as { lines: { fields: string[] }[] }).lines[0];
		expect(line.fields.sort()).toEqual(['date', 'reinvested']);
		expect(resolveItem(item.id, 'use-file')).toBeNull();
		expect(findDistribution(sheetDist.id)).toMatchObject({ date: '2026-10-16', reinvested: false });
		expect(
			editsOf('distribution', sheetDist.id)
				.map((e) => e.field)
				.sort()
		).toEqual(['date', 'perUnitE6', 'reinvested', 'unitsE6']);
	});
});
