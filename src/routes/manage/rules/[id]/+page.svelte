<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { formatMoney } from '$lib/money';
	import { shortDate } from '$lib/time';

	let { data, form } = $props();
	const init = $derived(data.initial);
	// svelte-ignore state_referenced_locally
	let action = $state(data.initial.action);
	let confirming = $state(false);
	const dollars = (c: number | undefined) => (c == null ? '' : String(c / 100));
	const test = $derived(form && 'test' in form && form.test ? form.test : data.test);
	const needsLine = $derived(action === 'budget');
	const mayHaveLine = $derived(
		action === 'repayment' || action === 'investing' || action === 'one_off'
	);
</script>

<svelte:head><title>{data.id ? 'Edit rule' : 'Add a rule'} · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage/rules"><Icon name="back" size={18} /> Rules</a>
<h1 class="disp h-title">{data.id ? 'Edit rule' : 'Add a rule'}</h1>

<div class="grid">
	<section class="card">
		{#if data.suggestedMerchant}
			<p class="note">
				Merchant filled in as “{data.suggestedMerchant}”. Save to use it; the old one is replaced.
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
			<input type="hidden" name="shown" value="1" />
			<label class="h-label"
				>Name <span class="sub">(for you; defaults to the merchant)</span>
				<input class="h-input" name="name" value={init.name} /></label
			>

			<fieldset class="group">
				<legend class="lbl">When a transaction matches</legend>
				<p class="sub small">
					Fill in as many as you like; all of them must match. Commas mean “any of”.
				</p>
				<label class="h-label"
					>Merchant contains
					<input class="h-input" name="merchant" value={init.match.merchant ?? ''} /></label
				>
				<label class="h-label"
					>Text contains <span class="sub">(description, raw text or message)</span>
					<input class="h-input" name="description" value={init.match.description ?? ''} /></label
				>
				<div class="h-row2">
					<label class="h-label"
						>Up category
						<input class="h-input" name="category" value={init.match.category ?? ''} /></label
					>
					<label class="h-label"
						>Up tag <input class="h-input" name="tag" value={init.match.tag ?? ''} /></label
					>
				</div>
				<div class="h-row2">
					<label class="h-label"
						>Account
						<select class="h-select" name="accountId">
							<option value="">Any</option>
							{#each data.accounts as a (a.id)}
								<option value={a.id} selected={init.match.accountId === a.id}>{a.name}</option>
							{/each}
						</select></label
					>
					<label class="h-label"
						>Money
						<select class="h-select" name="direction">
							<option value="" selected={!init.match.direction}>In or out</option>
							<option value="out" selected={init.match.direction === 'out'}>Out only</option>
							<option value="in" selected={init.match.direction === 'in'}>In only</option>
						</select></label
					>
				</div>
				<div class="h-row2">
					<label class="h-label"
						>At least
						<span class="h-money"
							><span class="cur">$</span><input
								name="min"
								inputmode="decimal"
								value={dollars(init.match.minCents)}
							/></span
						></label
					>
					<label class="h-label"
						>At most
						<span class="h-money"
							><span class="cur">$</span><input
								name="max"
								inputmode="decimal"
								value={dollars(init.match.maxCents)}
							/></span
						></label
					>
				</div>
			</fieldset>

			<fieldset class="group">
				<legend class="lbl">Then</legend>
				<label class="h-label"
					>It counts as
					<select class="h-select" name="action" bind:value={action}>
						{#each data.actions as a (a.value)}
							<option value={a.value}>{a.label}</option>
						{/each}
					</select></label
				>
				{#if needsLine || mayHaveLine}
					<label class="h-label"
						>Budget line {#if mayHaveLine}<span class="sub">(optional)</span>{/if}
						<select class="h-select" name="budgetLineId" required={needsLine}>
							<option value="">{needsLine ? 'Choose…' : 'None'}</option>
							{#each data.lines as l (l.id)}
								<option value={l.id} selected={init.budgetLineId === l.id}>{l.name}</option>
							{/each}
						</select></label
					>
				{/if}
				{#if action === 'other_person'}
					<label class="h-label"
						>Whose is it?
						<input
							class="h-input"
							name="label"
							list="labels"
							value={init.label ?? ''}
							required
							placeholder="A name, like the person you shop for"
						/>
						<datalist id="labels"
							>{#each data.labels as l (l)}<option value={l}></option>{/each}</datalist
						>
						<span class="sub"
							>Their spending is kept out of yours and totalled on the Budget screen.</span
						>
					</label>
				{/if}
				{#if !data.id}
					<label class="h-label"
						>Order
						<select class="h-select" name="position">
							<option value="first">Try before the other rules</option>
							<option value="last">Try after the other rules</option>
						</select></label
					>
				{/if}
				<label class="h-check"
					><input type="checkbox" name="enabled" checked={init.enabled} /> Rule is on</label
				>
			</fieldset>

			<div class="h-actions">
				<button class="btn primary">{data.id ? 'Save' : 'Add rule'}</button>
				<button class="btn" formaction="?/test">Test on past transactions</button>
				{#if form && 'saved' in form && form.saved}<span class="h-ok" role="status">Saved</span
					>{/if}
				{#if page.url.searchParams.has('added') && !form}<span class="h-ok" role="status"
						>Added</span
					>{/if}
				{#if form && 'error' in form && form.error}<span class="h-error" role="alert"
						>{form.error}</span
					>{/if}
			</div>
		</form>
	</section>

	{#if test}
		<section class="card">
			<span class="lbl">What it would sort</span>
			<p>
				<strong>{test.count}</strong> past transaction{test.count === 1 ? '' : 's'}
				{#if test.outCents}· {formatMoney(test.outCents)} out{/if}
				{#if test.inCents}· {formatMoney(test.inCents)} in{/if}
				{#if test.total > test.count}<span class="sub">
						({test.total - test.count} more match but an earlier rule or your own choice wins)</span
					>{/if}
			</p>
			{#each test.hits as h (h.id)}
				<div class="row hit" class:shadow={!!h.shadowedBy}>
					<span class="grow"
						><span class="d">{h.description}</span>
						<span class="sub small"
							>{shortDate(h.date, { year: true })}{h.shadowedBy
								? ` · ${h.shadowedBy} wins`
								: ''}</span
						></span
					>
					<span class="num" class:gain={h.amountCents > 0}
						>{formatMoney(h.amountCents, { cents: true })}</span
					>
				</div>
			{/each}
			{#if test.total > test.hits.length}<p class="sub small">
					Showing the latest {test.hits.length} of {test.total}.
				</p>{/if}
		</section>
	{/if}

	{#if data.id}
		<section class="card">
			<span class="lbl">Delete</span>
			{#if confirming}
				<form method="POST" action="?/delete" class="h-form" use:enhance>
					<p class="sub small">
						Transactions it sorted go back to the other rules, or to unsorted. Choices you made by
						hand stay.
					</p>
					<div class="h-actions">
						<button class="btn danger">Delete this rule</button>
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
	.group {
		border: 1px solid var(--border);
		border-radius: var(--r-tile);
		padding: 12px;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	legend {
		padding: 0 6px;
	}
	.note {
		background: var(--inset);
		border-radius: var(--r-tile);
		padding: 10px 12px;
		font-size: 13px;
		color: var(--estimate);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.hit .d {
		overflow-wrap: anywhere;
	}
	.hit.shadow {
		opacity: 0.55;
	}
</style>
