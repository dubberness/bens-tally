<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { shortDate, shortDateTime } from '$lib/time';
	import { arrow, signed, tone } from '$lib/components/history/fmt';
	import ActivityList from '$lib/components/invest/ActivityList.svelte';
	import ValueChart from '$lib/components/invest/ValueChart.svelte';
	import { RANGES, rangeStart, rangeView, type Range } from '$lib/invest/range';

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
	/** Percentage of the day's starting value, two places: 0.29%. */
	const dayPct = (c: { cents: number; baseCents: number }) =>
		c.baseCents > 0 ? `${((Math.abs(c.cents) / c.baseCents) * 100).toFixed(2)}%` : null;
	/** "▼ $12 · 0.3%" for a fund's row. */
	const dayLine = (c: { cents: number; baseCents: number }) =>
		[arrow(c.cents), dayPct(c)].filter(Boolean).join(' · ');

	let range = $state<Range>('1m');
	const view = $derived(rangeView(data.series, rangeStart(range, data.tax.today)));
	const PRICE_SOURCE: Record<string, string> = {
		yahoo: 'Yahoo Finance',
		sheet_csv: 'your sheet',
		manual: 'your own price',
		email: 'the last order email',
		trade: 'the last trade'
	};
	const METHOD: Record<string, string> = {
		fifo: 'FIFO, as in your sheet',
		lifo: 'LIFO',
		highest: 'highest cost first'
	};
	const span = (date: string) => {
		const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
		const a = t(data.tax.start);
		const b = t(data.tax.end);
		return Math.min(100, Math.max(0, ((t(date) - a) / (b - a)) * 100));
	};
	const taxLine = $derived.by(() => {
		const t = data.tax;
		if (t.totalCents < 0)
			return `Net capital loss so far (${METHOD[t.method]}). It carries forward against future gains.`;
		if (t.totalCents > 0)
			return `${formatMoney(t.netGainCents)} goes on your tax return after losses and the discount (${METHOD[t.method]}).`;
		return t.carryForwardCents
			? `No sales yet this year. ${formatMoney(t.carryForwardCents)} of losses carry in from earlier years.`
			: `No sales yet this year (${METHOD[t.method]}).`;
	});
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
			{#if data.day}
				<span class="num chg {tone(data.day.cents)}">{dayLine(data.day)} {data.day.label}</span>
			{/if}
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
			<div class="strip">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke={data.inbox ? 'var(--accent)' : 'var(--text-3)'}
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
					><path d="M4 13h4l1.5 3h5l1.5-3h4" /><path
						d="M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z"
					/></svg
				>
				<span class="grow small">
					{#if data.inbox}
						<span class="strong">{data.inbox} import{data.inbox === 1 ? '' : 's'}</span> to look at in
						the Inbox.
					{:else if data.email.configured}
						Emails: {data.email.lastEmailAt
							? `last one ${shortDateTime(data.email.lastEmailAt)}`
							: 'none yet'}{data.email.checkedAt
							? `, checked ${shortDateTime(data.email.checkedAt)}`
							: ''}{data.email.failed ? ' (the last check failed)' : ''}.
					{:else}
						Imports: nothing to look at.
					{/if}
				</span>
				<a class="small link" href="/manage/inbox">{data.inbox ? 'Inbox' : 'Upload CSV'}</a>
			</div>
		{:else}
			<span class="disp num big empty">—</span>
			<span class="sub">No investments yet. Import the sheet in Manage, or add funds there.</span>
		{/if}
	</header>

	{#if data.holdings.length}
		{#if data.series.length > 1}
			<section class="card chartbox">
				<div class="head">
					<span class="lbl">Value</span>
					<div class="seg-group" role="group" aria-label="Chart range">
						{#each RANGES as r (r.id)}
							<button class="seg" aria-pressed={range === r.id} onclick={() => (range = r.id)}
								>{r.label}</button
							>
						{/each}
					</div>
				</div>
				{#if view.shown.length > 1}
					<ValueChart points={view.shown} />
				{:else}
					<span class="sub">Not enough history in this range yet.</span>
				{/if}
				<div class="stats">
					<div>
						<span class="sub small">Market change</span>
						<span class="num strong {tone(view.marketCents)}">{signed(view.marketCents)}</span>
					</div>
					<div>
						<span class="sub small">Money in</span>
						<span class="num strong">{signed(view.moneyInCents)}</span>
					</div>
					<div>
						<span class="sub small">Value change</span>
						<span class="num strong {tone(view.changeCents)}">{signed(view.changeCents)}</span>
					</div>
				</div>
				<span class="sub small legend"
					><span class="ring" aria-hidden="true"></span>Days you bought or sold. Market change is
					what the funds did, leaving out new money.</span
				>
			</section>
		{/if}
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
								{#if h.day}
									<span class="num small {tone(h.day.cents)}"
										>{dayLine(h.day)} {data.day?.label}</span
									>
								{/if}
							</span>
						</a>
					{/each}
				</section>
			</div>

			<div class="col">
				<section class="card tax">
					<div class="head">
						<span class="lbl">Tax · FY {data.tax.label}</span>
						<span class="num strong {tone(data.tax.totalCents)}"
							>{data.tax.totalCents ? signed(data.tax.totalCents) : '$0'}</span
						>
					</div>
					<span class="sub">{taxLine}</span>
					<div class="timeline" aria-hidden="true">
						<div class="line"></div>
						<div class="line done" style="width: {span(data.tax.today)}%"></div>
						<div class="dot now" style="left: {span(data.tax.today)}%"></div>
						{#each data.tax.upcoming as u (u.date + u.message)}
							<div class="dot {u.kind}" style="left: {span(u.date)}%"></div>
						{/each}
						<div class="dot end" style="left: 100%"></div>
					</div>
					<div class="tl-labels sub small" aria-hidden="true">
						<span>Today</span><span>{shortDate(data.tax.end)}</span>
					</div>
					{#each data.tax.upcoming as u (u.date + u.message)}
						<div class="upcoming">
							<span class="key {u.kind}"></span>
							<span class="small-name"
								><span class="strong">{shortDate(u.date, { year: true })}:</span>
								{u.message}</span
							>
						</div>
					{/each}
					<a class="small link" href="/invest/tax">Parcels and the year's report ›</a>
				</section>

				<section class="card">
					<div class="head">
						<span class="lbl">Activity</span>
						<a class="small link" href="/invest/activity">All activity ›</a>
					</div>
					<ActivityList rows={data.activity} />
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
	.chartbox {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.seg-group {
		display: flex;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 4px;
		align-self: flex-start;
		flex: none;
	}
	.seg {
		border: 0;
		font: 600 13px var(--font-body);
		padding: 8px 14px;
		border-radius: 999px;
		min-height: 36px;
		min-width: 44px;
		cursor: pointer;
		background: transparent;
		color: var(--chip-text);
	}
	.seg[aria-pressed='true'] {
		background: var(--text);
		color: var(--ground);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.stats > div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ring {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 999px;
		border: 2px solid var(--text-2);
		background: var(--ground);
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
	.empty {
		color: var(--text-3);
	}
	.tax {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.timeline {
		position: relative;
		height: 18px;
		margin: 6px 8px 0;
	}
	.timeline .line {
		position: absolute;
		left: 0;
		right: 0;
		top: 7px;
		height: 3px;
		border-radius: 999px;
		background: var(--surface-2);
	}
	.timeline .line.done {
		right: auto;
		background: var(--accent);
	}
	.timeline .dot {
		position: absolute;
		top: 1px;
		width: 15px;
		height: 15px;
		margin-left: -7px;
		border-radius: 999px;
	}
	.dot.now {
		background: var(--accent);
	}
	.dot.discount,
	.key.discount {
		background: var(--gain);
	}
	.dot.rule,
	.dot.end,
	.key.rule {
		background: var(--estimate);
	}
	.tl-labels {
		display: flex;
		justify-content: space-between;
		margin-top: -6px;
	}
	.upcoming {
		display: flex;
		gap: 10px;
	}
	.key {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		margin-top: 5px;
		flex: none;
	}
</style>
