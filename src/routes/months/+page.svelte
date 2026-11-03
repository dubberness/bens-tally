<script lang="ts">
	import { formatMoney, formatMoneyShort } from '$lib/money';
	import { monthName } from '$lib/time';
	import CloseBanner from '$lib/components/history/CloseBanner.svelte';
	import { signed, tone } from '$lib/components/history/fmt';

	let { data } = $props();

	let picked = $state<string | null>(null);
	const sel = $derived(
		data.months.find((m) => m.month === picked) ?? data.months[data.months.length - 1] ?? null
	);
	const scale = $derived(Math.max(1, ...data.last12.map((m) => Math.abs(m.mine ?? 0))));
	const estShare = $derived.by(() => {
		const a = Math.abs(data.yearMine);
		const b = Math.abs(data.yearEst);
		return a + b > 0 ? (b / (a + b)) * 100 : 0;
	});
	const BAR = 92;
</script>

<svelte:head><title>Months · Ben's Tally</title></svelte:head>

<header class="top">
	<h1 class="disp page-title">Months</h1>
	{#if data.months.length}
		<span class="sub"
			>{data.months.length} snapshots, {monthName(data.first!)} to {monthName(data.last!)}.</span
		>
	{:else}
		<span class="sub">No months on record yet.</span>
	{/if}
	{#if data.toClose}
		<CloseBanner month={data.toClose.month} overdueDays={data.toClose.overdueDays} />
	{:else if data.nextClose}
		<a class="next" href="/months/close"
			><span
				>{monthName(data.nextClose.month, { year: false })} closes in {data.nextClose.days} day{data
					.nextClose.days === 1
					? ''
					: 's'}</span
			><span>How it works →</span></a
		>
	{/if}
</header>

{#if !data.months.length}
	<section class="card empty">
		<p class="sub">
			Each month-end becomes a locked snapshot here, with what changed and why. Bring in the sheet’s
			history from <a href="/manage/import">Manage › Sheet import</a>, or close your first month
			when it ends.
		</p>
	</section>
{:else}
	<div class="grid">
		<div class="col">
			<section class="card year">
				<span class="lbl">Last {data.last12.length} months</span>
				<span class="disp num big {tone(data.yearMine + data.yearEst)}"
					>{signed(data.yearMine + data.yearEst)}</span
				>
				<div class="split" aria-hidden="true">
					<div style="width: {100 - estShare}%; background: var(--gain)"></div>
					{#if estShare > 0}<div class="stripe" style="width: {estShare}%"></div>{/if}
				</div>
				<div class="legend-rows">
					<div class="lr">
						<span class="sq" style="background: var(--gain)"></span><span class="grow"
							>Saving, investing, paying debt, markets</span
						><span class="num strong">{signed(data.yearMine)}</span>
					</div>
					<div class="lr">
						<span class="sq" style="background: var(--estimate)"></span><span class="grow"
							>Changed estimates{data.estNames.length ? ` (${data.estNames.join(', ')})` : ''}</span
						><span class="num strong">{signed(data.yearEst)}</span>
					</div>
				</div>
				<span class="sub small"
					>Estimates are kept apart so one guess at the house price can’t pass for a great month.</span
				>
			</section>

			<section class="card bars-card">
				<div class="head">
					<span class="lbl">Month by month</span>
					<span class="sub small">Tap a month</span>
				</div>
				<div class="bars">
					<div class="zero"></div>
					{#each data.last12 as m, i (m.month)}
						{@const v = m.mine ?? 0}
						{@const h = Math.max(3, (Math.abs(v) / scale) * BAR)}
						{@const on = sel?.month === m.month}
						<button
							class="barbtn"
							aria-pressed={on}
							aria-label="{m.name}, {signed(v)}{m.estimates
								? `, estimate change ${signed(m.estimates)}`
								: ''}"
							onclick={() => (picked = m.month)}
						>
							{#if m.estimates}<span
									class="tag"
									style="top: {i > 0 && data.last12[i - 1].estimates && i % 2 ? 18 : 0}px"
									>{formatMoneyShort(m.estimates, { sign: true })}</span
								>{/if}
							<span
								class="b"
								class:on
								style="top: {v >= 0 ? 118 - h : 118}px; height: {h}px; background: {v >= 0
									? 'var(--gain)'
									: 'var(--loss)'}; --c: {v >= 0 ? 'var(--gain)' : 'var(--loss)'}"
							></span>
							<span class="letter" class:on>{m.letter}</span>
						</button>
					{/each}
				</div>
				<div class="keys">
					<span class="sub small k"><span class="sq" style="background: var(--gain)"></span>Up</span
					>
					<span class="sub small k"
						><span class="sq" style="background: var(--loss)"></span>Down</span
					>
					<span class="sub small k"
						><span class="sq" style="background: var(--estimate)"></span>Estimate change, off the
						scale</span
					>
				</div>
			</section>
		</div>

		<div class="col">
			{#if sel}
				<section class="card detail" aria-live="polite">
					<div class="head">
						<h2 class="disp">{sel.name}</h2>
						<span class="badge lock"
							><svg
								width="11"
								height="11"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.6"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
								><rect x="5" y="10.5" width="14" height="10" rx="2" /><path
									d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
								/></svg
							>Locked</span
						>
					</div>
					{#if sel.mine != null}
						<span class="disp num mine {tone(sel.mine)}">{signed(sel.mine)}</span>
					{/if}
					{#if sel.parts}
						{#each sel.parts as p (p.key)}
							<div class="line">
								<span>{p.label}</span><span class="num strong {tone(p.cents)}"
									>{signed(p.cents)}</span
								>
							</div>
						{/each}
						{#each sel.estimateItems as e (e.accountId)}
							<div class="line">
								<span>{e.name} estimate (kept apart)</span><span class="num strong est"
									>{signed(e.cents)}</span
								>
							</div>
						{/each}
					{:else}
						<p class="sub">The first month on record: {formatMoney(sel.netWorth)} net worth.</p>
					{/if}
					{#if sel.note}
						<div class="note">
							<span class="lbl tiny">Your note</span>
							<span>{sel.note}</span>
						</div>
					{/if}
					<a class="more" href="/months/{sel.month}"
						>Open {monthName(sel.month, { year: false })} →</a
					>
				</section>
			{/if}

			<section class="card list">
				{#each [...data.months].reverse() as m (m.month)}
					<a class="mrow" href="/months/{m.month}">
						<span class="mname">{m.short}</span>
						<span class="sub hint">{m.note ?? m.estimateLabel}</span>
						<span class="num strong {tone(m.mine ?? 0)}"
							>{m.mine == null ? formatMoney(m.netWorth) : signed(m.mine)}</span
						>
					</a>
				{/each}
				<a class="csv" href="/months/export.csv" download>Download every month (CSV)</a>
			</section>
		</div>
	</div>
{/if}

<style>
	.top {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 14px;
	}
	.page-title {
		font-size: 34px;
		letter-spacing: -0.02em;
	}
	.top :global(.banner),
	.next {
		margin-top: 10px;
	}
	.next {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-height: 48px;
		padding: 0 16px;
		border-radius: 16px;
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
		text-decoration: none;
		font-size: 14px;
		font-weight: 600;
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
	}
	.year {
		gap: 12px;
	}
	.big {
		font-size: 40px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
	}
	.split {
		display: flex;
		height: 12px;
		border-radius: 999px;
		overflow: hidden;
		gap: 2px;
	}
	.stripe {
		background: repeating-linear-gradient(135deg, var(--estimate) 0 6px, var(--estimate-2) 6px 9px);
	}
	.legend-rows {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.lr {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}
	.sq {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		flex: none;
		display: inline-block;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.strong {
		font-weight: 600;
	}
	.small {
		font-size: 12px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
	}
	.bars-card {
		padding: 16px 12px;
	}
	.bars-card .head,
	.keys {
		padding: 0 6px;
	}
	.bars {
		display: flex;
		justify-content: space-between;
		padding: 10px 4px 0;
		position: relative;
	}
	.zero {
		position: absolute;
		left: 4px;
		right: 4px;
		top: 128px;
		height: 1px;
		background: var(--border-strong);
	}
	.barbtn {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 24px;
		min-width: 24px;
		height: 202px;
		position: relative;
	}
	.barbtn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: 6px;
	}
	.tag {
		position: absolute;
		top: 0;
		font-size: 9px;
		font-weight: 700;
		color: var(--accent-ink);
		background: var(--estimate);
		border-radius: 6px;
		padding: 2px 3px;
		white-space: nowrap;
	}
	.b {
		position: absolute;
		left: 4px;
		width: 16px;
		border-radius: 5px;
		opacity: 0.55;
	}
	.b.on {
		opacity: 1;
		box-shadow:
			0 0 0 2px var(--ground),
			0 0 0 4px var(--c);
	}
	.letter {
		position: absolute;
		bottom: 0;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-3);
	}
	.letter.on {
		font-weight: 700;
		color: var(--text);
	}
	.keys {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		padding-top: 6px;
	}
	.k {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.detail {
		gap: 4px;
		border-color: var(--border-strong);
	}
	.detail h2 {
		font-size: 22px;
	}
	.lock {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.mine {
		font-size: 30px;
		font-weight: 750;
		padding: 4px 0 8px;
	}
	.line {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 10px 0;
		border-top: 1px solid var(--surface-2);
		font-size: 15px;
	}
	.est {
		color: var(--estimate);
	}
	.note {
		margin-top: 10px;
		background: var(--inset);
		border-radius: var(--r-tile);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.tiny {
		font-size: 11px;
	}
	.more {
		margin-top: 10px;
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.list {
		padding-top: 8px;
		padding-bottom: 8px;
	}
	.mrow {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--surface-2);
		min-height: 48px;
		color: var(--text);
		text-decoration: none;
	}
	.mrow:first-child {
		border-top: 0;
	}
	.mrow:hover .mname {
		color: var(--link);
	}
	.mname {
		width: 74px;
		flex: none;
		font-weight: 600;
		font-size: 15px;
	}
	.hint {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.csv {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		border-top: 1px solid var(--surface-2);
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
	}
	.empty p {
		margin: 0;
	}
</style>
