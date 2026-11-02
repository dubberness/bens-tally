<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';

	let { data, form } = $props();
	const METHOD: Record<string, string> = {
		fifo: 'Oldest parcels first (FIFO)',
		lifo: 'Newest parcels first (LIFO)',
		highest: 'Dearest parcels first (smallest gain)'
	};
	const keep =
		() =>
		({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
			update({ reset: false });
</script>

<svelte:head><title>Tax rules · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp h-title">Tax rules</h1>

<div class="grid">
	<div class="col">
		{#each data.rules as r (r.id)}
			<section class="card">
				<span class="lbl">From {r.fromDate}{r.toDate ? ` to ${r.toDate}` : ''}</span>
				<form method="POST" action="?/save" class="h-form" use:enhance={keep}>
					<input type="hidden" name="id" value={r.id} />
					<div class="h-row2">
						<label class="h-label"
							>Starts <input
								class="h-input"
								type="date"
								name="fromDate"
								value={r.fromDate}
								required
							/></label
						>
						<label class="h-label"
							>Ends <input
								class="h-input"
								type="date"
								name="toDate"
								value={r.toDate ?? ''}
							/></label
						>
						<label class="h-label"
							>Discount (%) <input
								class="h-input"
								name="discount"
								inputmode="decimal"
								value={r.discountBp / 100}
								required
							/></label
						>
						<label class="h-label"
							>Held longer than (months) <input
								class="h-input"
								name="months"
								inputmode="numeric"
								value={r.holdingMonths}
								required
							/></label
						>
					</div>
					<label class="h-label"
						>Note <input class="h-input" name="note" value={r.note ?? ''} /></label
					>
					<div class="h-actions">
						<button class="btn primary">Save</button>
						<button class="btn" formaction="?/delete">Delete</button>
						{#if form?.saved === String(r.id)}<span class="h-ok" role="status">Saved</span>{/if}
						{#if form?.error && form.id === String(r.id)}<span class="h-error" role="alert"
								>{form.error}</span
							>{/if}
					</div>
				</form>
			</section>
		{/each}
	</div>

	<div class="col">
		<section class="card">
			<span class="lbl">Matching sales to parcels</span>
			<p class="sub">
				Which units a sale uses decides its gain and whether it gets the discount. Your sheet uses
				oldest first.
			</p>
			<form method="POST" action="?/method" class="h-form" use:enhance={keep}>
				<label class="h-label"
					>Method
					<select class="h-select" name="method">
						{#each data.methods as m (m)}<option value={m} selected={data.method === m}
								>{METHOD[m]}</option
							>{/each}
					</select></label
				>
				<div class="h-actions">
					<button class="btn primary">Save</button>
					{#if form?.methodSaved}<span class="h-ok" role="status">Saved</span>{/if}
				</div>
			</form>
		</section>

		<section class="card">
			<span class="lbl">Add a rule</span>
			<p class="sub">
				For a change in the law, add a rule from the day it starts and give the old one an end date.
				Each sale uses the rule in force on its date.
			</p>
			<form method="POST" action="?/save" class="h-form" use:enhance>
				<div class="h-row2">
					<label class="h-label"
						>Starts <input class="h-input" type="date" name="fromDate" required /></label
					>
					<label class="h-label">Ends <input class="h-input" type="date" name="toDate" /></label>
					<label class="h-label"
						>Discount (%) <input
							class="h-input"
							name="discount"
							inputmode="decimal"
							required
						/></label
					>
					<label class="h-label"
						>Held longer than (months) <input
							class="h-input"
							name="months"
							inputmode="numeric"
							value="12"
							required
						/></label
					>
				</div>
				<label class="h-label">Note <input class="h-input" name="note" /></label>
				<div class="h-actions">
					<button class="btn primary">Add rule</button>
					{#if form?.saved === 'new'}<span class="h-ok" role="status">Added</span>{/if}
					{#if form?.error && !form.id}<span class="h-error" role="alert">{form.error}</span>{/if}
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
	p {
		margin: 0;
	}
</style>
