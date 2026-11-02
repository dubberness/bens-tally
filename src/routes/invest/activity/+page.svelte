<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import ActivityList from '$lib/components/invest/ActivityList.svelte';
	import { formatMoney } from '$lib/money';
	import { monthName } from '$lib/time';

	let { data } = $props();

	const months = $derived.by(() => {
		const m = new Map<string, typeof data.rows>();
		for (const r of data.rows) {
			const k = r.date.slice(0, 7);
			m.set(k, [...(m.get(k) ?? []), r]);
		}
		return [...m].map(([month, rows]) => ({
			month,
			rows,
			bought: rows.filter((r) => r.kind === 'buy').reduce((s, r) => s + r.amountCents, 0)
		}));
	});
	const go = (fund: string, kind: string) => {
		const q = new URLSearchParams();
		if (fund) q.set('fund', fund);
		if (kind) q.set('kind', kind);
		goto(q.size ? `?${q}` : '/invest/activity', { keepFocus: true, noScroll: true });
	};
</script>

<svelte:head><title>Activity · Ben's Tally</title></svelte:head>

<a class="back" href="/invest"><Icon name="back" size={18} /> Invest</a>
<h1 class="disp title">Activity</h1>

<div class="bar">
	<select
		class="pick"
		aria-label="Fund"
		value={data.fund}
		onchange={(e) => go(e.currentTarget.value, data.kind)}
	>
		<option value="">All funds</option>
		{#each data.funds as f (f.id)}<option value={f.ticker}>{f.ticker}</option>{/each}
	</select>
	<select
		class="pick"
		aria-label="Kind"
		value={data.kind}
		onchange={(e) => go(data.fund, e.currentTarget.value)}
	>
		<option value="">Trades and distributions</option>
		<option value="trades">Trades</option>
		<option value="distributions">Distributions</option>
	</select>
	<span class="grow"></span>
	<a class="btn" href="/invest/trades/new">Add a trade</a>
	<a class="btn" href="/invest/distributions/new">Add a distribution</a>
</div>

<div class="months">
	{#each months as m (m.month)}
		<section class="card">
			<div class="head">
				<span class="lbl">{monthName(m.month)}</span>
				{#if m.bought}<span class="sub small num">{formatMoney(m.bought)} bought</span>{/if}
			</div>
			<ActivityList rows={m.rows} />
		</section>
	{:else}
		<p class="sub">Nothing here yet.</p>
	{/each}
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
	.title {
		font-size: 28px;
		letter-spacing: -0.02em;
		margin: 0 0 14px;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 14px;
	}
	.grow {
		flex: 1;
	}
	.pick {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 12px;
		min-height: 44px;
		padding: 0 10px;
		font: inherit;
	}
	.months {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		max-width: 720px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.small {
		font-size: 12px;
	}
</style>
