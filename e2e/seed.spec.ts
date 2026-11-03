import { it } from 'vitest';
import { db, schema } from '$lib/server/db';
import { addDays, addMonths, localDate, localMonth, monthEnd } from '$lib/time';
import { lockMonth, refreshOpenMonth } from '$lib/server/history/snapshots';
import { createRule } from '$lib/server/budget/engine';
import { onTransactionsSynced } from '$lib/server/budget/hooks';
import { createScenario } from '$lib/server/plan/scenarios';
import { SEED_PARAMS } from '$lib/plan/params';
import { savePrefs } from '$lib/server/history/prefs';
import { setSetting } from '$lib/server/settings';
import { taxRules } from '$lib/server/invest/tax';

/*
 * Fills DATA_DIR with a small made-up household for the browser tests: invented accounts,
 * round numbers and a fictional fund. Nothing here comes from anyone's real records.
 * Run with `npm run e2e:seed` (the Playwright config does it for you).
 */

const MONTHS_OF_HISTORY = 14;

it('seeds the demo data', () => {
	const now = new Date();
	const today = localDate();
	const thisMonth = localMonth();

	const account = (
		name: string,
		kind: string,
		side: 'asset' | 'liability',
		source: string,
		extra: Partial<typeof schema.accounts.$inferInsert> = {}
	) =>
		db
			.insert(schema.accounts)
			.values({ name, kind, side, source, createdAt: now, updatedAt: now, ...extra })
			.returning()
			.get();

	const everyday = account('Demo Everyday', 'cash', 'asset', 'manual', {
		upAccountId: 'demo-up-everyday',
		investable: true,
		sortOrder: 1,
		closeOrder: 1
	});
	const holiday = account('Demo Holiday Saver', 'cash', 'asset', 'manual', {
		upAccountId: 'demo-up-holiday',
		investable: true,
		sortOrder: 2,
		closeOrder: 2
	});
	const emergency = account('Demo Emergency Saver', 'cash', 'asset', 'manual', {
		upAccountId: 'demo-up-emergency',
		investable: true,
		sortOrder: 3,
		closeOrder: 3
	});
	const funds = account('Demo Fund Portfolio', 'investment', 'asset', 'betashares', {
		investable: true,
		sortOrder: 4
	});
	const superAcc = account('Demo Super', 'super', 'asset', 'manual', {
		sortOrder: 5,
		closeOrder: 4,
		updateEveryDays: 35
	});
	const house = account('Demo House', 'property', 'asset', 'manual', {
		sortOrder: 6,
		closeOrder: 5
	});
	const mortgage = account('Demo Home Loan', 'loan', 'liability', 'manual', {
		sortOrder: 7,
		closeOrder: 6
	});
	const car = account('Demo Car Loan', 'loan', 'liability', 'calculated', { sortOrder: 8 });

	db.insert(schema.calculations)
		.values({
			accountId: car.id,
			kind: 'amortised',
			params: {
				principalCents: 1_200_000,
				annualRateBp: 500,
				repaymentCents: 40_000,
				firstPaymentDate: addMonths(thisMonth, -20) + '-15',
				payments: 36
			},
			updatedAt: now
		})
		.run();

	// A fictional fund: a buy on the 3rd of every month, with a price that drifts upward.
	const fund = db
		.insert(schema.instruments)
		.values({
			ticker: 'DEMO',
			name: 'Demo Diversified Fund',
			accountId: funds.id,
			priceSource: 'manual',
			targetBp: 10_000,
			distributionFrequency: 'quarterly',
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	const price = (m: number) => 30_0000 + m * 2500; // ten-thousandths of a dollar
	const history = Array.from({ length: MONTHS_OF_HISTORY }, (_, i) =>
		addMonths(thisMonth, i - MONTHS_OF_HISTORY)
	);
	history.forEach((month, i) => {
		const px = price(i);
		const units = 4_000_000 + i * 50_000; // 4.00 units upward, in millionths
		const value = Math.round((units / 1e6) * (px / 1e4) * 100);
		db.insert(schema.trades)
			.values({
				orderId: `demo-order-${i}`,
				instrumentId: fund.id,
				date: `${month}-03`,
				side: 'buy',
				unitsE6: units,
				priceE4: px,
				valueCents: value,
				feeCents: 0,
				source: 'manual',
				createdAt: now,
				updatedAt: now
			})
			.run();
		db.insert(schema.prices)
			.values({
				instrumentId: fund.id,
				date: monthEnd(month),
				closeE4: px + 1000,
				source: 'manual',
				fetchedAt: now
			})
			.run();
	});
	// A part sale, so Invest › Tax has a gain to show.
	db.insert(schema.trades)
		.values({
			orderId: 'demo-order-sale',
			instrumentId: fund.id,
			date: addDays(today, -20),
			side: 'sell',
			unitsE6: 3_000_000,
			priceE4: price(MONTHS_OF_HISTORY) + 1000,
			valueCents: Math.round(3 * ((price(MONTHS_OF_HISTORY) + 1000) / 1e4) * 100),
			feeCents: 0,
			source: 'manual',
			createdAt: now,
			updatedAt: now
		})
		.run();
	db.insert(schema.prices)
		.values({
			instrumentId: fund.id,
			date: today,
			closeE4: price(MONTHS_OF_HISTORY),
			source: 'manual',
			fetchedAt: now
		})
		.run();
	db.insert(schema.distributions)
		.values({
			instrumentId: fund.id,
			date: addDays(today, -40),
			amountCents: 18_000,
			frankingCents: 2_000,
			reinvested: false,
			source: 'manual',
			createdAt: now,
			updatedAt: now
		})
		.run();

	// Locked months, oldest first. Round figures that move a little each month.
	history.forEach((month, i) => {
		lockMonth(
			month,
			[
				{ accountId: everyday.id, valueCents: 250_000 + (i % 4) * 30_000 },
				{ accountId: holiday.id, valueCents: 120_000 + i * 20_000 },
				{ accountId: emergency.id, valueCents: 1_000_000 + i * 15_000 },
				{ accountId: superAcc.id, valueCents: 9_000_000 + i * 120_000 },
				{
					accountId: house.id,
					valueCents: 60_000_000 + (i >= 8 ? 1_500_000 : 0),
					reestimate: i === 8
				},
				{ accountId: mortgage.id, valueCents: 40_000_000 - i * 150_000 }
			],
			i === 5 ? 'A made-up note on this month.' : null
		);
	});
	refreshOpenMonth(thisMonth);

	// Budget: a handful of invented lines and merchants.
	const line = (name: string, group: string, monthly: number, saver?: number) => {
		const l = db
			.insert(schema.budgetLines)
			.values({
				name,
				group,
				saverAccountId: saver ?? null,
				sortOrder: 0,
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		db.insert(schema.budgetAmounts)
			.values({
				lineId: l.id,
				fromMonth: addMonths(thisMonth, -12),
				amountCents: monthly,
				period: 'month'
			})
			.run();
		return l;
	};
	const power = line('Demo Power Co', 'bills', 15_000);
	const internet = line('Demo Net Provider', 'bills', 8_000);
	const food = line('Groceries', 'living', 60_000);
	const fuel = line('Fuel', 'living', 20_000);
	const eatOut = line('Eating out', 'fun', 25_000);
	line('Holiday', 'savings', 20_000, holiday.id);
	line('Emergency', 'savings', 15_000, emergency.id);
	line('Fund buys', 'investing', 40_000);
	db.insert(schema.paySplits)
		.values([
			{ accountId: holiday.id, amountCents: 5_000, sortOrder: 1, updatedAt: now },
			{ accountId: emergency.id, amountCents: 3_500, sortOrder: 2, updatedAt: now }
		])
		.run();
	db.insert(schema.yearlyBills)
		.values({
			name: 'Demo Insurance',
			yearlyCents: 120_000,
			months: [3],
			budgetLineId: null,
			createdAt: now,
			updatedAt: now
		})
		.run();

	const rule = (name: string, merchant: string, lineId: number) =>
		createRule(
			{
				name,
				enabled: true,
				match: { merchant },
				action: 'budget',
				budgetLineId: lineId,
				label: null
			},
			'last',
			false
		);
	rule('Power', 'Demo Power', power.id);
	rule('Internet', 'Demo Net', internet.id);
	rule('Groceries', 'Demo Grocer', food.id);
	rule('Fuel', 'Demo Servo', fuel.id);
	rule('Eating out', 'Demo Cafe', eatOut.id);
	createRule(
		{
			name: 'Pay',
			enabled: true,
			match: { merchant: 'Demo Employer' },
			action: 'income',
			budgetLineId: null,
			label: null
		},
		'last',
		false
	);

	// Two months of Up-style transactions, none dated after today.
	let n = 0;
	const tx = (date: string, description: string, amountCents: number) => {
		if (date > today) return;
		const at = new Date(`${date}T12:00:00+11:00`);
		const id = `demo-tx-${++n}`;
		db.insert(schema.transactions)
			.values({
				id,
				accountId: everyday.id,
				upAccountId: 'demo-up-everyday',
				status: 'SETTLED',
				description,
				amountCents,
				date,
				createdAt: at,
				settledAt: at,
				syncedAt: at
			})
			.run();
	};
	// Dated back from today, so every month the screens show has some activity.
	for (let back = 0; back < 60; back++) {
		const date = addDays(today, -back);
		if (back % 7 === 1) tx(date, 'Demo Employer', 150_000);
		if (back % 7 === 3) tx(date, 'Demo Grocer', -(12_000 + (back % 5) * 1_700));
		if (back % 30 === 5) tx(date, 'Demo Power Co', -14_800);
		if (back % 30 === 6) tx(date, 'Demo Net Provider', -8_000);
		if (back % 14 === 4) tx(date, 'Demo Servo', -6_400);
		if (back % 10 === 2) tx(date, 'Demo Cafe', -4_200);
		if (back === 9) tx(date, 'Mystery Shop', -2_500);
	}
	onTransactionsSynced(
		db
			.select({ id: schema.transactions.id })
			.from(schema.transactions)
			.all()
			.map((r) => r.id)
	);

	db.insert(schema.events)
		.values([
			{ date: addDays(today, 12), title: 'Demo rates letter due', createdAt: now },
			{ date: addDays(today, 45), title: 'Demo insurance renewal', createdAt: now }
		])
		.run();
	db.insert(schema.importItems)
		.values({
			source: 'email',
			externalId: 'demo-email-1',
			receivedAt: now,
			subject: 'Demo order confirmation',
			raw: 'From: Demo Broker <demo@example.com>\r\nSubject: Demo order confirmation\r\nDate: Tue, 03 Nov 2026 10:00:00 +1100\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThis is a made-up email body.\r\n',
			status: 'review',
			createdAt: now
		})
		.run();

	taxRules(); // writes the generic starting rule
	createScenario('Base', { ...SEED_PARAMS, salaryCents: 9_000_000 });
	savePrefs({ payday: 4, birthDate: '1988-07-15', theme: 'system' });
	setSetting('budget.pay_frequency', 'week');
});
