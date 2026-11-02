import { describe, expect, it } from 'vitest';
import {
	amortisedBalance,
	amortisedFrom,
	expectedLoanBalance,
	paymentDatesBetween,
	paymentsMade,
	shareOf
} from './schedule';

// A made-up loan: $10,000 at 6% with $200 a month from 10 Jan 2024.
const loan = {
	principalCents: 10_000_00,
	annualRateBp: 600,
	repaymentCents: 200_00,
	firstPaymentDate: '2024-01-10',
	payments: 60
};

describe('loan schedule', () => {
	it('counts repayments on or before a date', () => {
		expect(paymentsMade(loan, '2024-01-09')).toBe(0);
		expect(paymentsMade(loan, '2024-01-10')).toBe(1);
		expect(paymentsMade(loan, '2024-03-31')).toBe(3);
		expect(paymentsMade(loan, '2040-01-01')).toBe(60);
	});

	it('follows the standard amortisation formula', () => {
		// After one payment: 10000 × 1.005 − 200 = 9850.
		expect(amortisedBalance(loan, '2024-01-15')).toBe(9_850_00);
		// After two: 9850 × 1.005 − 200 = 9699.25.
		expect(amortisedBalance(loan, '2024-02-29')).toBe(9_699_25);
		expect(amortisedBalance(loan, '2040-01-01')).toBe(0);
	});

	it('restarts from a newer balance entered by hand', () => {
		const known = { date: '2024-02-20', valueCents: 9_000_00 };
		expect(amortisedFrom(loan, '2024-02-25', known)).toBe(9_000_00);
		expect(amortisedFrom(loan, '2024-03-10', known)).toBe(8_845_00);
		// Before the hand entry, the schedule still applies.
		expect(amortisedFrom(loan, '2024-01-15', known)).toBe(9_850_00);
	});

	it('clamps repayment days to short months', () => {
		expect(paymentDatesBetween('2024-01-31', '2024-04-30', 31)).toEqual([
			'2024-02-29',
			'2024-03-31',
			'2024-04-30'
		]);
	});

	it('expects a hand-entered loan to fall by one repayment less interest each month end', () => {
		const terms = { annualRateBp: 1200, repaymentCents: 1_000_00 };
		expect(
			expectedLoanBalance({ date: '2025-01-31', valueCents: 100_000_00 }, terms, '2025-02-28')
		).toBe(100_000_00 + 1_000_00 - 1_000_00);
		expect(
			expectedLoanBalance({ date: '2025-01-31', valueCents: 50_000_00 }, terms, '2025-01-31')
		).toBe(50_000_00);
	});

	it('takes a share in basis points', () => {
		expect(shareOf(500_000_00, 2_500)).toBe(125_000_00);
		expect(shareOf(333_33, 1)).toBe(3);
	});
});
