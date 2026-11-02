<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { shortDate, shortDateTime } from '$lib/time';
	import { arrow, signed, tone } from '$lib/components/history/fmt';

	let { data } = $props();

	const units = (e6: number, places = 2) =>
		(e6 / 1e6).toLocaleString('en-AU', { minimumFractionDigits: places, maximumFractionDigits: 4 });
	const price = (e4: number) =>
		'$' +
		(e4 / 1e4).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
	const pct = (bp: number) => `${Math.round(bp / 100)}%`;
	const allTimePct = $derived(
		data.costCents > 0 ? ((data.allTimeCents / data.costCents) * 100).toFixed(1) : null
	);
	const SOURCE: Record<string, string> = {
		sheet: 'Sheet',
		email: 'Email',
		csv: 'CSV',
		manual: 'You'
	};
	const PRICE_SOURCE: Record<string, string> = {
		yahoo: 'Yahoo Finance',
		sheet_csv: 'your sheet',
		manual: 'your own price',
		email: 'the last order email',
		trade: 'the last trade'
	};
	const what = (a: (typeof data.activity)[number]) =>
		a.kind === 'buy'
			? `Bought ${a.ticker}`
			: a.kind === 'sell'
				? `Sold ${a.ticker}`
				: `${a.ticker} distribution`;
	const how = (a: (typeof data.activity)[number]) => {
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

<svelte:head><title>Invest · Ben's Tally</title></svelte:head>

<div class="invest">
	<header class="hero">
		<h1 class="disp title">Investments</h1>
		{#if data.holdings.length}
			<span class="disp num big">{formatMoney(data.valueCents)}</span>
			<span class="num chg {tone(data.allTimeCents)}"
				>{arrow(data.allTimeCents)} all time{allTimePct != null ? ` · ${allTimePct}%` : ''}</span
			>
			<span class="sub num small"
				>Unrealised {signed(data.unrealisedCents)} · sold {signed(data.realisedCents)} · distributions
				{signed(data.distributionsCents)}</span
			>
			<div class="strip">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="var(--gain)"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="M3.5 17 9 11.5l4 4L20.5 8" /><path d="M15 8h5.5v5.5" /></svg
				>
				<span class="grow small">
					{#if data.priced.fetchedAt}
						Prices from {PRICE_SOURCE[data.priced.source ?? ''] ?? 'the feed'}, checked {shortDateTime(
							data.priced.fetchedAt
						)}.
					{:else}
						No prices fetched yet; values use each fund's last trade.
					{/if}
				</span>
				<a class="small link" href="/manage/instruments">Funds</a>
			</div>
		{:else}
			<span class="disp num big empty">—</span>
			<span class="sub">No investments yet. Import the sheet in Manage, or add funds there.</span>
		{/if}
	</header>

	{#if data.holdings.length}
		<div class="cols">
			<div class="col">
				<section class="card">
					<div class="head">
						<span class="lbl">Mix vs target</span>
						<span class="sub small">White tick = target</span>
					</div>
					<div class="mix">
						{#each data.mix as m (m.ticker)}
							<div class="mix-row">
								<div class="mix-top">
									<span class="strong">{m.ticker}</span>
									<span class="num"
										><span class="strong">{pct(m.nowBp)}</span><span class="sub target">
											{m.targetBp == null ? 'no target' : `target ${pct(m.targetBp)}`}</span
										></span
									>
								</div>
								<div class="track">
									<div
										class="fill"
										style="width: {Math.max(m.nowBp / 100, 0.8)}%; background: {m.colour}"
									></div>
									{#if m.targetBp != null}
										<div class="tick-mark" style="left: calc({m.targetBp / 100}% - 1px)"></div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
					{#if data.checks.length}
						<div class="note">
							<span class="sub grow">{data.checks.map((c) => c.message).join(' ')}</span>
							<a class="btn small-btn" href="/manage/instruments">Fix targets</a>
						</div>
					{/if}
				</section>

				<section class="card list-card">
					{#each data.holdings as h (h.id)}
						<a class="row holding" href="/manage/instruments/{h.id}">
							<span class="chip" style="background: {h.colour}">{h.ticker}</span>
							<span class="grow names">
								<span class="name">{h.name ?? h.ticker}</span>
								<span class="sub num small"
									>{units(h.unitsE6)} units · avg {price(
										Math.round((h.costCents * 1e8) / h.unitsE6)
									)}</span
								>
							</span>
							<span class="vals">
								<span class="num strong">{formatMoney(h.valueCents)}</span>
								<span class="num small strong {tone(h.valueCents - h.costCents)}"
									>{signed(h.valueCents - h.costCents)}</span
								>
							</span>
						</a>
					{/each}
				</section>
			</div>

			<div class="col">
				<section class="card">
					<span class="lbl">Activity</span>
					<div class="activity">
						{#each data.activity as a (a.key)}
							<div class="row act">
								<span class="sub num date small">{shortDate(a.date)}</span>
								<span class="grow names">
									<span class="name small-name">{what(a)}</span>
									<span class="sub num small">{how(a)}</span>
								</span>
								<span class="vals">
									<span class="num strong small-name" class:gain={a.kind !== 'buy'}
										>{a.kind === 'buy' ? '' : '+'}{formatMoney(a.amountCents, {
											cents: true
										})}</span
									>
									<span class="badge">{SOURCE[a.source] ?? a.source}</span>
								</span>
							</div>
						{:else}
							<p class="sub">No trades yet.</p>
						{/each}
					</div>
				</section>
			</div>
		</div>
	{/if}
</div>

<style>
	.invest {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.title {
		margin: 0;
		font-size: 34px;
		font-weight: 750;
		letter-spacing: -0.02em;
	}
	.big {
		font-size: 48px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
	}
	.chg {
		font-size: 15px;
		font-weight: 600;
	}
	.small {
		font-size: 12px;
	}
	.strong {
		font-weight: 600;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.strip {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 10px 12px;
		margin-top: 4px;
	}
	.strip .small {
		font-size: 13px;
	}
	.link {
		font-weight: 600;
		text-decoration: none;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.cols {
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
		.cols {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.mix {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 14px;
	}
	.mix-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.mix-top {
		display: flex;
		justify-content: space-between;
		font-size: 14px;
	}
	.track {
		position: relative;
		height: 8px;
		border-radius: 999px;
		background: var(--border);
	}
	.fill {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: 999px;
	}
	.tick-mark {
		position: absolute;
		top: -3px;
		width: 2px;
		height: 14px;
		border-radius: 2px;
		background: var(--text);
	}
	.note {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
		background: var(--ground);
		border-radius: 14px;
		padding: 10px 12px;
	}
	.target {
		margin-left: 6px;
	}
	.small-btn {
		flex: none;
	}
	.list-card {
		padding-top: 8px;
		padding-bottom: 8px;
	}
	.list-card .row:first-child {
		border-top: 0;
	}
	.holding {
		color: inherit;
		text-decoration: none;
	}
	.chip {
		width: 44px;
		height: 40px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		font:
			700 10px var(--font-body),
			system-ui,
			sans-serif;
		flex: none;
		color: var(--ground);
		overflow: hidden;
	}
	.names {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.small-name {
		font-size: 14px;
	}
	.vals {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		flex: none;
	}
	.activity {
		display: flex;
		flex-direction: column;
		margin-top: 8px;
	}
	.date {
		width: 48px;
		flex: none;
		font-weight: 600;
	}
	.empty {
		color: var(--text-3);
	}
</style>
