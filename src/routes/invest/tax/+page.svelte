<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { formatMoney } from '$lib/money';
	import { shortDate } from '$lib/time';
	import { signed, tone } from '$lib/components/history/fmt';

	let { data } = $props();
	const y = $derived(data.year);
	const units = (e6: number) =>
		(e6 / 1e6).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
	const METHOD: Record<string, string> = {
		fifo: 'oldest parcels first (FIFO)',
		lifo: 'newest parcels first (LIFO)',
		highest: 'dearest parcels first'
	};
	const money = (c: number) => formatMoney(c, { cents: true });
	const funds = $derived.by(() => {
		const m = new Map<string, typeof data.parcels>();
		for (const p of data.parcels) m.set(p.ticker, [...(m.get(p.ticker) ?? []), p]);
		return [...m].map(([ticker, list]) => ({
			ticker,
			list,
			units: list.reduce((s, p) => s + p.unitsE6, 0),
			eligible: list.filter((p) => p.discountFrom && p.discountFrom <= data.today).length
		}));
	});
</script>

<svelte:head><title>Capital gains · Ben's Tally</title></svelte:head>

<a class="back" href="/invest"><Icon name="back" size={18} /> Invest</a>
<div class="title-row">
	<h1 class="disp title">Capital gains</h1>
	{#if data.years.length > 1}
		<select
			class="year"
			aria-label="Financial year"
			value={data.yearKey}
			onchange={(e) => goto(`?fy=${e.currentTarget.value}`, { keepFocus: true })}
		>
			{#each data.years as fy (fy.key)}<option value={fy.key}>FY {fy.label}</option>{/each}
		</select>
	{/if}
</div>

<div class="grid">
	<div class="col">
		<section class="card">
			<div class="head">
				<span class="lbl">FY {y.label}</span>
				<a class="small link" href="/invest/tax/{data.yearKey}.csv" download>Export CSV</a>
			</div>
			<dl class="sum num">
				<dt>Gains that get the discount</dt>
				<dd>{money(y.discountableCents)}</dd>
				<dt>Other gains</dt>
				<dd>{money(y.otherGainsCents)}</dd>
				<dt>Losses this year</dt>
				<dd>{y.lossesCents ? `−${money(y.lossesCents)}` : money(0)}</dd>
				<dt>Losses brought forward</dt>
				<dd>{y.broughtForwardCents ? `−${money(y.broughtForwardCents)}` : money(0)}</dd>
				<dt>Discount</dt>
				<dd>{y.discountCents ? `−${money(y.discountCents)}` : money(0)}</dd>
				<dt class="strong">Net capital gain</dt>
				<dd class="strong">{money(y.netGainCents)}</dd>
				{#if y.carryForwardCents}
					<dt>Loss to carry forward</dt>
					<dd>{money(y.carryForwardCents)}</dd>
				{/if}
			</dl>
			<p class="sub small">
				Sales use {METHOD[data.method]}. Losses come off gains that get no discount first, then the
				discount applies. Change the method or the discount rules in
				<a href="/manage/tax">Manage › Tax rules</a>.
			</p>
		</section>

		<section class="card">
			<span class="lbl">Sales</span>
			{#each y.disposals as d, i (i)}
				<div class="row line">
					<span class="grow names">
						<span class="strong">{d.ticker} · {shortDate(d.date, { year: true })}</span>
						<span class="sub small num"
							>{units(d.unitsE6)} units bought {shortDate(d.boughtOn, { year: true })} · cost {money(
								d.costCents
							)}{d.discountBp ? ` · ${d.discountBp / 100}% discount` : ''}</span
						>
					</span>
					<span class="num strong {tone(d.gainCents)}">{signed(d.gainCents)}</span>
				</div>
			{:else}
				<p class="sub">No sales this financial year.</p>
			{/each}
		</section>
	</div>

	<div class="col">
		{#if data.upcoming.length}
			<section class="card">
				<span class="lbl">Coming up</span>
				{#each data.upcoming as u (u.date + u.message)}
					<div class="upcoming">
						<span class="key {u.kind}"></span>
						<span><span class="strong">{shortDate(u.date, { year: true })}:</span> {u.message}</span
						>
					</div>
				{/each}
			</section>
		{/if}

		<section class="card">
			<span class="lbl">Parcels held</span>
			{#each funds as f (f.ticker)}
				<details class="fund">
					<summary class="row">
						<span class="grow names">
							<span class="strong">{f.ticker} · {units(f.units)} units</span>
							<span class="sub small"
								>{f.list.length} parcel{f.list.length === 1 ? '' : 's'} · {f.eligible} past the holding
								period</span
							>
						</span>
						<span class="sub small">Show</span>
					</summary>
					{#each f.list as p, i (i)}
						<div class="row line">
							<span class="grow names">
								<span class="strong">{units(p.unitsE6)} units</span>
								<span class="sub small num"
									>Bought {shortDate(p.boughtOn, { year: true })} · cost {formatMoney(
										p.costCents
									)}</span
								>
							</span>
							<span class="vals">
								{#if p.valueCents != null}
									<span class="num small {tone(p.valueCents - p.costCents)}"
										>{signed(p.valueCents - p.costCents)}</span
									>
								{/if}
								{#if p.discountFrom}
									<span class="badge" class:ok={p.discountFrom <= data.today}
										>{p.discountFrom <= data.today
											? 'Discount'
											: `Discount ${shortDate(p.discountFrom, { year: true })}`}</span
									>
								{/if}
							</span>
						</div>
					{/each}
				</details>
			{:else}
				<p class="sub">Nothing held.</p>
			{/each}
		</section>
	</div>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 44px;
		color: var(--text-2);
		text-decoration: none;
	}
	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 0 0 14px;
	}
	.title {
		font-size: 28px;
		letter-spacing: -0.02em;
		margin: 0;
	}
	.year {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 12px;
		min-height: 44px;
		padding: 0 10px;
		font: inherit;
	}
	.grid {
		display: grid;
		gap: 12px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
			column-gap: 20px;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.link {
		font-weight: 600;
		text-decoration: none;
	}
	.sum {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px 12px;
		margin: 0;
		font-size: 14px;
	}
	.sum dt {
		color: var(--text-2);
	}
	.sum dd {
		margin: 0;
		text-align: right;
	}
	.sum .strong {
		color: var(--text);
	}
	p {
		margin: 0;
	}
	.line:first-of-type {
		border-top: 0;
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
	.vals {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		flex: none;
	}
	.strong {
		font-weight: 600;
	}
	.small {
		font-size: 12px;
	}
	.fund summary {
		cursor: pointer;
		list-style: none;
	}
	.fund summary::-webkit-details-marker {
		display: none;
	}
	.fund:first-of-type summary {
		border-top: 0;
	}
	.fund[open] summary .sub:last-child {
		visibility: hidden;
	}
	.badge.ok {
		color: var(--gain);
	}
	.upcoming {
		display: flex;
		gap: 10px;
		font-size: 14px;
	}
	.key {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		margin-top: 5px;
		flex: none;
	}
	.key.discount {
		background: var(--gain);
	}
	.key.rule {
		background: var(--estimate);
	}
</style>
