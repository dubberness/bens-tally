<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { shortDate } from '$lib/time';

	interface Row {
		key: string;
		href: string;
		date: string;
		kind: 'buy' | 'sell' | 'distribution';
		ticker: string;
		unitsE6: number | null;
		priceE4: number | null;
		perUnitE6: number | null;
		amountCents: number;
		reinvested: boolean;
		source: string;
		note: string | null;
	}
	let { rows }: { rows: Row[] } = $props();

	const SOURCE: Record<string, string> = {
		sheet: 'Sheet',
		email: 'Email',
		csv: 'CSV',
		manual: 'You'
	};
	const units = (e6: number, places = 2) =>
		(e6 / 1e6).toLocaleString('en-AU', { minimumFractionDigits: places, maximumFractionDigits: 4 });
	const price = (e4: number) =>
		'$' +
		(e4 / 1e4).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
	const what = (a: Row) =>
		a.kind === 'buy'
			? `Bought ${a.ticker}`
			: a.kind === 'sell'
				? `Sold ${a.ticker}`
				: `${a.ticker} distribution`;
	const how = (a: Row) => {
		if (a.kind === 'distribution') {
			const parts = [];
			if (a.perUnitE6 && a.unitsE6)
				parts.push(`$${(a.perUnitE6 / 1e6).toFixed(4)} × ${units(a.unitsE6)} units`);
			parts.push(a.reinvested ? 'reinvested' : 'kept as cash');
			return parts.join(' · ');
		}
		return `${units(a.unitsE6 ?? 0, 4)} @ ${price(a.priceE4 ?? 0)}`;
	};
</script>

<div class="activity">
	{#each rows as a (a.key)}
		<a class="row act" href={a.href}>
			<span class="sub num date small">{shortDate(a.date)}</span>
			<span class="grow names">
				<span class="what">{what(a)}</span>
				<span class="sub num small">{how(a)}{a.note ? ` · ${a.note}` : ''}</span>
			</span>
			<span class="vals">
				<span class="num strong what" class:gain={a.kind !== 'buy'}
					>{a.kind === 'buy' ? '' : '+'}{formatMoney(a.amountCents, { cents: true })}</span
				>
				<span class="badge">{SOURCE[a.source] ?? a.source}</span>
			</span>
		</a>
	{:else}
		<p class="sub">Nothing yet.</p>
	{/each}
</div>

<style>
	.activity {
		display: flex;
		flex-direction: column;
	}
	.act {
		color: inherit;
		text-decoration: none;
	}
	.act:first-child {
		border-top: 0;
	}
	.date {
		width: 48px;
		flex: none;
		font-weight: 600;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.names {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.names .sub {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.what {
		font-size: 14px;
		font-weight: 600;
	}
	.vals {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		flex: none;
	}
	.small {
		font-size: 12px;
	}
	.strong {
		font-weight: 600;
	}
	p {
		margin: 0;
	}
</style>
