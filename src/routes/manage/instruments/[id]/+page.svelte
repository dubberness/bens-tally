<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { shortDate } from '$lib/time';

	let { data, form } = $props();
	const i = $derived(data.instrument);
	// svelte-ignore state_referenced_locally
	let source = $state(data.instrument.priceSource);
	const asPrice = (e4: number | null) => (e4 == null ? '' : String(e4 / 1e4));
	const asPct = (bp: number | null) => (bp == null ? '' : String(bp / 100));
	const FREQ: Record<string, string> = {
		monthly: 'Monthly',
		quarterly: 'Quarterly',
		'half-yearly': 'Half-yearly',
		yearly: 'Yearly'
	};
	const PRICE_FROM: Record<string, string> = {
		yahoo: 'Yahoo Finance',
		sheet_csv: 'your sheet CSV',
		manual: 'your own price',
		email: 'an order email',
		trade: 'the last trade'
	};
</script>

<svelte:head><title>{i.ticker} · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage/instruments"><Icon name="back" size={18} /> Funds</a>
<h1 class="disp h-title">{i.ticker}</h1>

<div class="grid">
	<section class="card">
		<span class="lbl">Fund</span>
		{#if data.price}
			<p class="sub">
				Price ${(data.price.priceE4 / 1e4).toFixed(4)} on {shortDate(data.price.date, {
					year: true
				})}, from {PRICE_FROM[data.price.source] ?? data.price.source}.
			</p>
		{/if}
		<form
			method="POST"
			action="?/save"
			class="h-form"
			use:enhance={() =>
				({ update }) =>
					update({ reset: false })}
		>
			<div class="h-row2">
				<label class="h-label"
					>Ticker <input class="h-input" name="ticker" value={i.ticker} required /></label
				>
				<label class="h-label"
					>Exchange <input class="h-input" name="exchange" value={i.exchange} required /></label
				>
			</div>
			<label class="h-label">Name <input class="h-input" name="name" value={i.name ?? ''} /></label>
			<div class="h-row2">
				<label class="h-label"
					>Target (%) <input
						class="h-input"
						name="target"
						inputmode="decimal"
						value={asPct(i.targetBp)}
						placeholder="None"
					/></label
				>
				<label class="h-label"
					>Pays distributions
					<select class="h-select" name="frequency">
						<option value="" selected={!i.distributionFrequency}>Not set</option>
						{#each data.frequencies as f (f)}<option
								value={f}
								selected={i.distributionFrequency === f}>{FREQ[f]}</option
							>{/each}
					</select></label
				>
			</div>
			<label class="h-label"
				>Counts toward
				<select class="h-select" name="accountId">
					{#each data.accounts as a (a.id)}<option value={a.id} selected={i.accountId === a.id}
							>{a.name}</option
						>{/each}
				</select></label
			>
			<label class="h-label"
				>Price comes from
				<select class="h-select" name="priceSource" bind:value={source}>
					<option value="yahoo">Yahoo Finance (about 20 minutes delayed)</option>
					<option value="sheet_csv">A published sheet CSV</option>
					<option value="manual">My own price</option>
				</select></label
			>
			{#if source === 'sheet_csv'}
				<label class="h-label"
					>Sheet CSV link <input
						class="h-input"
						name="sheetCsvUrl"
						type="url"
						value={i.sheetCsvUrl ?? ''}
						placeholder="https://docs.google.com/…/pub?output=csv"
						required
					/></label
				>
				<p class="sub small">
					In Google Sheets, File › Share › Publish to web, pick the cell or range as CSV. The price
					is the number next to the ticker, or the only number in it.
				</p>
			{:else}
				<input type="hidden" name="sheetCsvUrl" value={i.sheetCsvUrl ?? ''} />
			{/if}
			{#if source === 'manual'}
				<label class="h-label"
					>My price
					<span class="h-money"
						><span class="cur">$</span><input
							name="manualPrice"
							inputmode="decimal"
							value={asPrice(i.manualPriceE4)}
							required
						/></span
					></label
				>
				<p class="sub small">Used for today's value until you pick a feed again.</p>
			{/if}
			<div class="h-actions">
				<button class="btn primary">Save</button>
				{#if form?.saved}<span class="h-ok" role="status">Saved</span>{/if}
				{#if form?.error}<span class="h-error" role="alert">{form.error}</span>{/if}
			</div>
		</form>
	</section>

	{#if data.deletable}
		<section class="card">
			<span class="lbl">Remove</span>
			<form method="POST" action="?/delete" use:enhance>
				<button class="btn danger">Remove {i.ticker}</button>
			</form>
		</section>
	{:else}
		<p class="sub small">
			{i.ticker} has trades or distributions, so it stays for its history. Clear its target if you no
			longer want it in the mix.
		</p>
	{/if}
</div>

<style>
	.grid {
		display: grid;
		gap: 12px;
		max-width: 640px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
</style>
