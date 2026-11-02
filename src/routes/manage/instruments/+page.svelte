<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { formatMoney } from '$lib/money';
	import { shortDate } from '$lib/time';

	let { data, form } = $props();
	const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 1 : 0)}%`;
	const price = (e4: number) =>
		'$' +
		(e4 / 1e4).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
	const SOURCE: Record<string, string> = {
		yahoo: 'Yahoo',
		sheet_csv: 'Sheet CSV',
		manual: 'Your price'
	};
	const held = $derived(data.list.filter((i) => i.held || i.targetBp));
	const past = $derived(data.list.filter((i) => !i.held && !i.targetBp));
</script>

<svelte:head><title>Funds and targets · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp h-title">Funds and targets</h1>

<div class="grid">
	<div class="col">
		<section class="card">
			<div class="head">
				<span class="lbl">Funds</span>
				<span class="sub small num" class:warn={data.targetTotal && data.targetTotal !== 10_000}
					>Targets total {pct(data.targetTotal)}</span
				>
			</div>
			{#if !data.list.length}<p class="sub">
					No funds yet. Add one below or bring in the sheet.
				</p>{/if}
			<ul class="list">
				{#each held as i (i.id)}
					<li class="item">
						<a class="grow name" href="/manage/instruments/{i.id}">
							<span class="strong">{i.ticker}</span>
							<span class="sub small"
								>{i.held ? `${pct(i.nowBp)} now` : 'not held'} · {i.targetBp != null
									? `target ${pct(i.targetBp)}`
									: 'no target'}</span
							>
						</a>
						<span class="vals">
							<span class="num strong"
								>{i.valueCents != null ? formatMoney(i.valueCents) : '—'}</span
							>
							<span class="sub small num"
								>{i.priceE4 != null && i.held ? `${price(i.priceE4)} · ` : ''}{SOURCE[
									i.priceSource
								]}{i.priceDate && i.held ? ` · ${shortDate(i.priceDate)}` : ''}</span
							>
						</span>
					</li>
				{/each}
			</ul>
			{#if past.length}
				<details>
					<summary class="sub">Sold out, no target ({past.length})</summary>
					<ul class="list">
						{#each past as i (i.id)}
							<li class="item">
								<a class="grow name" href="/manage/instruments/{i.id}">
									<span class="strong">{i.ticker}</span>
									<span class="sub small">{i.name ?? ''}</span>
								</a>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</section>
	</div>

	<div class="col">
		<section class="card">
			<span class="lbl">Drift warning</span>
			<p class="sub">
				Invest and Home flag a fund whose share of the portfolio is more than this many points off
				its target.
			</p>
			<form
				method="POST"
				action="?/band"
				class="h-form inline"
				use:enhance={() =>
					({ update }) =>
						update({ reset: false })}
			>
				<label class="h-label"
					>Band (percentage points)
					<input class="h-input" name="band" inputmode="decimal" value={data.driftBandBp / 100} />
				</label>
				<div class="h-actions">
					<button class="btn primary">Save</button>
					{#if form?.bandSaved}<span class="h-ok" role="status">Saved</span>{/if}
					{#if form?.bandError}<span class="h-error" role="alert">{form.bandError}</span>{/if}
				</div>
			</form>
		</section>

		<section class="card">
			<span class="lbl">Add a fund</span>
			<form method="POST" action="?/add" class="h-form" use:enhance>
				<div class="h-row2">
					<label class="h-label"
						>Ticker <input class="h-input" name="ticker" placeholder="e.g. VAS" required /></label
					>
					<label class="h-label"
						>Target (%) <input
							class="h-input"
							name="target"
							inputmode="decimal"
							placeholder="None"
						/></label
					>
				</div>
				<label class="h-label">Name <input class="h-input" name="name" /></label>
				<input type="hidden" name="priceSource" value="yahoo" />
				<div class="h-actions">
					<button class="btn primary">Add fund</button>
					{#if form?.addError}<span class="h-error" role="alert">{form.addError}</span>{/if}
				</div>
			</form>
		</section>
	</div>
</div>

<style>
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
			grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
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
	p {
		margin: 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 56px;
		border-top: 1px solid var(--surface-2);
	}
	.item:first-child {
		border-top: 0;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.name {
		display: flex;
		flex-direction: column;
		gap: 2px;
		color: var(--text);
		text-decoration: none;
		min-height: 44px;
		justify-content: center;
	}
	.name:hover .strong {
		color: var(--link);
	}
	.vals {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}
	.strong {
		font-weight: 600;
	}
	.small {
		font-size: 12px;
	}
	.warn {
		color: var(--estimate);
	}
	summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
</style>
