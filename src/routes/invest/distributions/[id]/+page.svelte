<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { describeEdit, SOURCE_TEXT } from '$lib/components/invest/edit-history';
	import { localDate, shortDateTime } from '$lib/time';

	let { data, form } = $props();
	const d = $derived(data.distribution);
	const ticker = $derived(data.funds.find((f) => f.id === d?.instrumentId)?.ticker);
	const fundName = (id: number) => data.funds.find((f) => f.id === id)?.ticker;
	const num = (n: number | null | undefined, scale: number) => (n == null ? '' : String(n / scale));
	let confirming = $state(false);
</script>

<svelte:head
	><title>{d ? `${ticker} distribution` : 'Add a distribution'} · Ben's Tally</title></svelte:head
>

<a class="h-back" href="/invest/activity"><Icon name="back" size={18} /> Activity</a>
<h1 class="disp h-title">{d ? `${ticker} distribution` : 'Add a distribution'}</h1>

<div class="grid">
	<section class="card">
		{#if d}<p class="sub small">
				{SOURCE_TEXT[d.source] ?? d.source} Changes are kept in the history below.
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
					>Paid on <input
						class="h-input"
						type="date"
						name="date"
						value={d?.date ?? localDate()}
						required
					/></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Per unit
					<span class="h-money"
						><span class="cur">$</span><input
							name="perUnit"
							inputmode="decimal"
							value={num(d?.perUnitE6, 1e6)}
						/></span
					></label
				>
				<label class="h-label"
					>Units held <input
						class="h-input"
						name="units"
						inputmode="decimal"
						value={num(d?.unitsE6, 1e6)}
					/></label
				>
			</div>
			<div class="h-row2">
				<label class="h-label"
					>Amount
					<span class="h-money"
						><span class="cur">$</span><input
							name="amount"
							inputmode="decimal"
							value={num(d?.amountCents, 100)}
							placeholder="Worked out"
						/></span
					></label
				>
				<label class="h-label"
					>Franking credits
					<span class="h-money"
						><span class="cur">$</span><input
							name="franking"
							inputmode="decimal"
							value={num(d?.frankingCents, 100)}
							placeholder="None"
						/></span
					></label
				>
			</div>
			<label class="h-check"
				><input type="checkbox" name="reinvested" checked={d?.reinvested ?? false} /> Reinvested as new
				units</label
			>
			<label class="h-label">Note <input class="h-input" name="note" value={d?.note ?? ''} /></label
			>
			{#if d}
				<label class="h-label"
					>Why the change <span class="sub">(optional, kept in the history)</span>
					<input class="h-input" name="reason" /></label
				>
			{/if}
			<div class="h-actions">
				<button class="btn primary">{d ? 'Save' : 'Add distribution'}</button>
				{#if form?.saved}<span class="h-ok" role="status">Saved</span>{/if}
				{#if page.url.searchParams.has('added') && !form}<span class="h-ok" role="status"
						>Added</span
					>{/if}
				{#if form?.error}<span class="h-error" role="alert">{form.error}</span>{/if}
			</div>
		</form>
	</section>

	{#if d}
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
					<p class="sub small">The Invest screen will no longer count it.</p>
					<label class="h-label"
						>Why <span class="sub">(optional)</span><input class="h-input" name="reason" /></label
					>
					<div class="h-actions">
						<button class="btn danger">Delete this distribution</button>
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
