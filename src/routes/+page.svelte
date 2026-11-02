<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatMoney } from '$lib/money';
	import { monthName, shortDate, weekdayOf } from '$lib/time';
	import NetWorthChart from '$lib/components/history/NetWorthChart.svelte';
	import CloseBanner from '$lib/components/history/CloseBanner.svelte';
	import { arrow, owed, signed, tone } from '$lib/components/history/fmt';

	let { data } = $props();

	let mode = $state<'all' | 'inv'>('all');
	let range = $state<'1y' | 'all'>('all');

	const points = $derived.by(() => {
		const pts = data.chart.map((p) => ({
			key: p.key,
			label: p.label,
			value: mode === 'all' ? p.all : p.inv,
			estimate: mode === 'all' ? p.estimate : 0,
			estimateNote: p.estimateNote
		}));
		return range === '1y' ? pts.slice(-13) : pts;
	});
	const hasRings = $derived(mode === 'all' && points.some((p) => p.estimate));

	const hero = $derived(mode === 'all' ? data.netWorth : data.investable);
	const change = $derived(
		data.change ? (mode === 'all' ? data.change.all : data.change.inv) : null
	);
	const split = $derived.by(() => {
		const c = data.change;
		if (!c) return '';
		if (mode === 'inv') return c.invParts.map((p) => `${p.label} ${signed(p.cents)}`).join(' · ');
		return `Estimates ${signed(c.estimates)} · markets and saving ${signed(c.all - c.estimates)}`;
	});

	const assets = $derived(data.rows.filter((r) => r.side === 'asset'));
	const debts = $derived(data.rows.filter((r) => r.side === 'liability'));
	const barWidth = (v: number, total: number) => (total > 0 ? Math.max(0, (v / total) * 100) : 0);
	const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
	const MONTHS = [
		'JAN',
		'FEB',
		'MAR',
		'APR',
		'MAY',
		'JUN',
		'JUL',
		'AUG',
		'SEP',
		'OCT',
		'NOV',
		'DEC'
	];
	const soon = (date: string) => {
		const days = (Date.parse(date) - Date.now()) / 86_400_000;
		return days < 6 ? WEEKDAY[weekdayOf(date)] : MONTHS[Number(date.slice(5, 7)) - 1];
	};
</script>

<svelte:head><title>Ben's Tally</title></svelte:head>

<div class="home">
	{#if data.toClose}
		<div class="a-banner">
			<CloseBanner month={data.toClose.month} overdueDays={data.toClose.overdueDays} />
		</div>
	{/if}

	<div class="col main-col">
		<section class="a-hero hero">
			{#if data.hasData}
				<div class="seg-group" role="group" aria-label="What to count">
					<button class="seg" aria-pressed={mode === 'all'} onclick={() => (mode = 'all')}
						>Everything</button
					>
					<button class="seg" aria-pressed={mode === 'inv'} onclick={() => (mode = 'inv')}
						>Investable</button
					>
				</div>
				<span class="lbl">{mode === 'all' ? 'Net worth' : 'Investable'}</span>
				<span class="disp num big">{formatMoney(hero)}</span>
				{#if change != null && data.change}
					<div class="change">
						<span class="num chg {tone(change)}"
							>{arrow(change)} since {monthName(data.change.month, { year: false })} closed</span
						>
						<span class="sub num">{split}</span>
					</div>
				{:else}
					<span class="sub">No month closed yet.</span>
				{/if}
			{:else}
				<span class="lbl">Net worth</span>
				<span class="disp num big empty" aria-label="No figures yet">—</span>
				<span class="sub">Nothing tracked yet.</span>
			{/if}
		</section>

		{#if data.chart.length > 1}
			<section class="a-chart chartbox">
				<NetWorthChart {points} colour={mode === 'all' ? 'var(--accent)' : 'var(--c-etf)'} />
				<div class="chart-foot">
					{#if hasRings}
						<span class="legend sub"
							><span class="ring" aria-hidden="true"></span>Ringed points are estimate changes, not
							money you made or lost.</span
						>
					{:else}
						<span></span>
					{/if}
					<div class="seg-group small" role="group" aria-label="Chart range">
						<button class="seg" aria-pressed={range === '1y'} onclick={() => (range = '1y')}
							>1Y</button
						>
						<button class="seg" aria-pressed={range === 'all'} onclick={() => (range = 'all')}
							>All</button
						>
					</div>
				</div>
			</section>
		{/if}

		{#if data.rows.length}
			<section class="a-own card">
				<div class="head">
					<span class="lbl">What you own and owe</span>
					<span class="sub num small">{formatMoney(data.owned)} / {formatMoney(data.owed)}</span>
				</div>
				<div class="bar" aria-hidden="true">
					{#each assets as r (r.name + r.id)}
						<div style="width: {barWidth(r.valueCents, data.owned)}%; background: {r.colour}"></div>
					{/each}
				</div>
				{#if data.owed > 0}
					<div
						class="bar"
						aria-hidden="true"
						style="width: {Math.min(100, barWidth(data.owed, data.owned))}%"
					>
						{#each debts as r (r.name + r.id)}
							<div
								style="width: {barWidth(r.valueCents, data.owed)}%; background: {r.colour}"
							></div>
						{/each}
					</div>
				{/if}
				<div class="list">
					{#each data.rows as r (r.name + r.id)}
						{#if r.children}
							<details class="group">
								<summary class="row acct">
									<span class="dot" style="background: {r.colour}"></span>
									<span class="grow names">
										<span class="name">{r.name}</span>
										<span class="sub small">{r.detail}</span>
									</span>
									<span class="vals">
										<span class="num val">{owed(r.valueCents, r.side)}</span>
										<span class="badge">{r.badge}</span>
									</span>
								</summary>
								{#each r.children as c (c.id)}
									<a class="row acct child" href="/accounts/{c.id}">
										<span class="grow names">
											<span class="name">{c.name}</span>
										</span>
										<span class="vals">
											<span class="num val">{owed(c.valueCents, c.side)}</span>
											<span class="badge">{c.badge}</span>
										</span>
									</a>
								{/each}
							</details>
						{:else}
							<a class="row acct" href="/accounts/{r.id}">
								<span class="dot" style="background: {r.colour}"></span>
								<span class="grow names">
									<span class="name">{r.name}</span>
									<span class="sub small">{r.detail}</span>
								</span>
								<span class="vals">
									<span class="num val">{owed(r.valueCents, r.side)}</span>
									<span class="badge">{r.badge}</span>
								</span>
							</a>
						{/if}
					{/each}
				</div>
			</section>
		{/if}
	</div>
	<div class="col side-col">
		{#if !data.hasData}
			<section class="a-cards card start">
				<span class="lbl" style="color: var(--accent)">Get started</span>
				<a class="row link" href="/manage/import">
					<span class="grow"
						><strong>Bring in your history</strong>
						<span class="sub"
							>Every month-end from the Personal Wealth sheet, checked to the dollar.</span
						></span
					><span aria-hidden="true">→</span>
				</a>
				<a class="row link" href="/manage/accounts">
					<span class="grow"
						><strong>Add an account</strong>
						<span class="sub">Cash, investments, super, a home or a loan.</span></span
					><span aria-hidden="true">→</span>
				</a>
			</section>
		{/if}

		{#if data.checks.length}
			<section class="a-checks card checks" aria-label="Needs attention">
				<span class="lbl" style="color: var(--estimate)">Needs attention</span>
				{#each data.checks as c (c.key)}
					<div class="row check">
						<span class="grow">{c.message}</span>
						{#if c.fixHref}<a class="btn small" href={c.fixHref}>{c.fixLabel ?? 'Fix'}</a>{/if}
						<form method="POST" action="?/dismiss" use:enhance>
							<input type="hidden" name="key" value={c.key} />
							<input type="hidden" name="fingerprint" value={c.fingerprint} />
							<button class="icon" aria-label="Dismiss: {c.message}">✕</button>
						</form>
					</div>
				{/each}
			</section>
		{/if}

		{#if data.events.length}
			<section class="a-events card">
				<div class="head">
					<span class="lbl" style="color: var(--accent)">Coming up</span>
					<a class="sub more" href="/manage/events">Edit</a>
				</div>
				{#each data.events as e (e.id)}
					<div class="event">
						<div class="cal" aria-hidden="true">
							<div class="cal-top">{soon(e.date)}</div>
							<div class="disp cal-day">{Number(e.date.slice(8))}</div>
						</div>
						<div class="ev-text">
							<span class="ev-title">{e.title}</span>
							<span class="sub"
								><span class="sr-only">{shortDate(e.date, { year: true })}. </span>{e.note ??
									''}</span
							>
						</div>
					</div>
				{/each}
			</section>
		{/if}

		{#if data.lastMonth?.breakdown}
			{@const b = data.lastMonth.breakdown}
			<a class="a-last card last" href="/months/{data.lastMonth.month}">
				<div class="head">
					<span class="lbl">{monthName(data.lastMonth.month, { year: false })} closed</span>
					<span class="disp num last-total {tone(b.mine)}">{signed(b.mine)}</span>
				</div>
				<div class="tiles">
					{#each b.parts as p (p.key)}
						<div class="tile">
							<div class="sub small">{p.label}</div>
							<div class="num tv {tone(p.cents)}">{signed(p.cents)}</div>
						</div>
					{/each}
					{#if b.estimates}
						<div class="tile est">
							<div class="sub small">Estimates (kept apart)</div>
							<div class="num tv">{signed(b.estimates)}</div>
						</div>
					{/if}
				</div>
				<span class="more">All months →</span>
			</a>
		{/if}
	</div>
</div>

<style>
	.home {
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'banner' 'hero' 'chart' 'cards' 'checks' 'events' 'own' 'last';
	}
	.a-banner {
		grid-area: banner;
	}
	.a-hero {
		grid-area: hero;
	}
	.a-chart {
		grid-area: chart;
	}
	.a-cards {
		grid-area: cards;
	}
	.a-checks {
		grid-area: checks;
	}
	.a-events {
		grid-area: events;
	}
	.a-own {
		grid-area: own;
	}
	.a-last {
		grid-area: last;
	}
	.col {
		display: contents;
	}
	@media (min-width: 900px) {
		.home {
			grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
			grid-template-areas: none;
			align-items: start;
			column-gap: 20px;
		}
		.a-banner {
			grid-column: 1 / -1;
		}
		.col {
			display: flex;
			flex-direction: column;
			gap: 12px;
			min-width: 0;
		}
	}

	.hero {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 0 4px;
	}
	.seg-group {
		display: flex;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 4px;
		align-self: flex-start;
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
	.big {
		font-size: 52px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
	}
	.big.empty {
		color: var(--text-3);
	}
	.change {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.chg {
		font-size: 15px;
		font-weight: 600;
	}
	.chartbox {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.chart-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 0 4px;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}
	.ring {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 999px;
		border: 2px solid var(--estimate);
		background: var(--ground);
	}
	.seg-group.small {
		flex: none;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.more {
		font-size: 13px;
		font-weight: 600;
		color: var(--link);
		text-decoration: none;
	}
	.small {
		font-size: 12px;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.card {
		display: flex;
		flex-direction: column;
	}
	.start {
		gap: 4px;
	}
	.link {
		color: var(--text);
		text-decoration: none;
		min-height: 56px;
	}
	.checks .check {
		min-height: 48px;
	}
	.btn.small {
		min-height: 44px;
		padding: 0 14px;
		font-size: 13px;
	}
	.icon {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		border: 0;
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
		font-size: 14px;
	}
	.icon:hover {
		color: var(--text);
	}
	form {
		margin: 0;
	}
	.event {
		display: flex;
		gap: 12px;
		padding-top: 12px;
	}
	.cal {
		width: 44px;
		flex: none;
		text-align: center;
		border-radius: 12px;
		background: var(--surface-2);
		padding: 6px 0;
	}
	.cal-top {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-2);
	}
	.cal-day {
		font-size: 20px;
		font-weight: 700;
	}
	.ev-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ev-title {
		font-size: 15px;
		font-weight: 600;
	}
	.bar {
		display: flex;
		height: 12px;
		border-radius: 999px;
		overflow: hidden;
		gap: 2px;
		margin-top: 14px;
	}
	.bar + .bar {
		margin-top: 6px;
	}
	.list {
		display: flex;
		flex-direction: column;
		margin-top: 12px;
	}
	.acct {
		color: var(--text);
		text-decoration: none;
		min-height: 56px;
		cursor: pointer;
	}
	.acct:hover .name {
		color: var(--link);
	}
	.list > :global(*:first-child),
	.list > details:first-child > summary {
		border-top: 0;
	}
	.group summary {
		list-style: none;
	}
	.group summary::-webkit-details-marker {
		display: none;
	}
	.child {
		padding-left: 22px;
		min-height: 48px;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		flex: none;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.names .sub {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.vals {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.val {
		font-size: 15px;
		font-weight: 600;
	}
	.last {
		gap: 12px;
		text-decoration: none;
		color: var(--text);
	}
	.last:hover {
		color: var(--text);
		border-color: #3a3a42;
	}
	.last-total {
		font-size: 22px;
		font-weight: 700;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.tv {
		font-weight: 600;
	}
	.tile.est .tv {
		color: var(--estimate);
	}
</style>
