<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { describeEdit, SOURCE_TEXT } from '$lib/components/invest/edit-history';
	import { localDate, shortDateTime } from '$lib/time';

	let { data, form } = $props();
	const t = $derived(data.trade);
	const ticker = $derived(data.funds.find((f) => f.id === t?.instrumentId)?.ticker);
	const num = (n: number | null | undefined, scale: number) => (n == null ? '' : String(n / scale));
	const fundName = (id: number) => data.funds.find((f) => f.id === id)?.ticker;
	let confirming = $state(false);
</script>

<svelte:head><title>{t ? `${ticker} trade` : 'Add a trade'} · Ben's Tally</title></svelte:head>

<a class="h-back" href="/invest/activity"><Icon name="back" size={18} /> Activity</a>
<h1 class="disp h-title">
	{t ? `${t.side === 'buy' ? 'Bought' : 'Sold'} ${ticker}` : 'Add a trade'}
</h1>

<div class="grid">
	<section class="card">
		{#if t}<p class="sub small">
				{SOURCE_TEXT[t.source] ?? t.source}
				{#if t.importItemId}<a href="/manage/inbox/{t.importItemId}"
						>{t.source === 'email' ? 'Show the email' : 'Show where it came from'}</a
					>.{/if}
				Changes are kept in the history below.
			</p>{/if}
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
					>Fund
					<select class="h-select" name="instrumentId" required>
						{#each data.funds as f (f.id)}<option value={f.id} selected={f.id === data.fundId}
								>{f.ticker}</option
							>{/each}
					</select></label
				>
				<label class="h-label"
					>Buy or sell
					<select class="h-select" name="side">
						<option value="buy" selected={t?.side !== 'sell'}>Buy</option>
						<option value="sell" selected={t?.side === 'sell'}>Sell</option>
					</select></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Date <input
						class="h-input"
						type="date"
						name="date"
						value={t?.date ?? localDate()}
						required
					/></label
				>
				<label class="h-label"
					>Units <input
						class="h-input"
						name="units"
						inputmode="decimal"
						value={num(t?.unitsE6, 1e6)}
						required
					/></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Price
					<span class="h-money"
						><span class="cur">$</span><input
							name="price"
							inputmode="decimal"
							value={num(t?.priceE4, 1e4)}
						/></span
					></label
				>
				<label class="h-label"
					>Value
					<span class="h-money"
						><span class="cur">$</span><input
							name="value"
							inputmode="decimal"
							value={num(t?.valueCents, 100)}
							placeholder="Worked out"
						/></span
					></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Fee
					<span class="h-money"
						><span class="cur">$</span><input
							name="fee"
							inputmode="decimal"
							value={num(t?.feeCents, 100)}
							placeholder="0"
						/></span
					></label
				>
				<label class="h-label"
					>Order ID <input
						class="h-input"
						name="orderId"
						value={t?.orderId ?? ''}
						placeholder="From Betashares"
					/></label
				>
			</div>
			<label class="h-label">Note <input class="h-input" name="note" value={t?.note ?? ''} /></label
			>
			{#if t}
				<label class="h-label"
					>Why the change <span class="sub">(optional, kept in the history)</span>
					<input class="h-input" name="reason" /></label
				>
			{/if}
			<div class="h-actions">
				<button class="btn primary">{t ? 'Save' : 'Add trade'}</button>
				{#if form?.saved}<span class="h-ok" role="status">Saved</span>{/if}
				{#if page.url.searchParams.has('added') && !form}<span class="h-ok" role="status"
						>Added</span
					>{/if}
				{#if form?.error}<span class="h-error" role="alert">{form.error}</span>{/if}
			</div>
		</form>
	</section>

	{#if t}
		<section class="card">
			<span class="lbl">History</span>
			{#each data.edits as e (e.id)}
				<div class="row line">
					<span class="grow names">
						<span class="small">{describeEdit(e, fundName)}</span>
						<span class="sub small">{shortDateTime(e.at)}{e.reason ? ` · ${e.reason}` : ''}</span>
					</span>
				</div>
			{:else}
				<p class="sub small">No changes since it came in.</p>
			{/each}
		</section>

		<section class="card">
			<span class="lbl">Delete</span>
			{#if confirming}
				<form method="POST" action="?/delete" class="h-form" use:enhance>
					<p class="sub small">
						Holdings, capital gains and the Invest screen will no longer count it.
						{t.source === 'sheet' || t.source === 'csv'
							? 'A later import may bring it back if it is still in the file.'
							: ''}
					</p>
					<label class="h-label"
						>Why <span class="sub">(optional)</span><input class="h-input" name="reason" /></label
					>
					<div class="h-actions">
						<button class="btn danger">Delete this trade</button>
						<button class="btn" type="button" onclick={() => (confirming = false)}>Cancel</button>
					</div>
				</form>
			{:else}
				<div class="h-actions">
					<button class="btn danger" type="button" onclick={() => (confirming = true)}
						>Delete…</button
					>
				</div>
			{/if}
		</section>
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
	.grow {
		flex: 1;
		min-width: 0;
	}
	.names {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
