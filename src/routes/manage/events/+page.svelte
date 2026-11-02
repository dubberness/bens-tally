<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';
	import { shortDate } from '$lib/time';

	let { data, form } = $props();
	let editId = $state<number | null>(null);
	const upcoming = $derived(data.events.filter((e) => e.date >= data.today));
	const past = $derived(data.events.filter((e) => e.date < data.today).reverse());
</script>

<svelte:head><title>Coming up · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp h-title">Coming up</h1>

{#snippet fields(e?: (typeof data.events)[number])}
	<div class="h-row2">
		<label class="h-label"
			>Date <input
				class="h-input"
				type="date"
				name="date"
				value={e?.date ?? data.today}
				required
			/></label
		>
		<label class="h-label"
			>About
			<select class="h-select" name="accountId">
				<option value="">No account</option>
				{#each data.accounts as a (a.id)}<option value={a.id} selected={e?.accountId === a.id}
						>{a.name}</option
					>{/each}
			</select></label
		>
	</div>
	<label class="h-label"
		>Title <input class="h-input" name="title" value={e?.title ?? ''} required /></label
	>
	<label class="h-label"
		>Note <input class="h-input" name="note" value={e?.note ?? ''} placeholder="Optional" /></label
	>
{/snippet}

<div class="grid">
	<section class="card">
		<span class="lbl">Dates to remember</span>
		<p class="sub small">The next three show on Home.</p>
		{#if !upcoming.length}<p class="sub">Nothing coming up.</p>{/if}
		{#each [...upcoming, ...past] as e (e.id)}
			<div class="item" class:past={e.date < data.today}>
				<div class="row-top">
					<span class="grow"
						><strong>{e.title}</strong>
						<span class="sub small"
							>{shortDate(e.date, { year: true })}{e.dismissed ? ' · hidden' : ''}{e.note
								? ` · ${e.note}`
								: ''}</span
						></span
					>
					<button
						class="edit"
						aria-expanded={editId === e.id}
						aria-label="Edit {e.title}"
						onclick={() => (editId = editId === e.id ? null : e.id)}>Edit</button
					>
				</div>
				{#if editId === e.id}
					<form
						method="POST"
						action="?/update"
						class="h-form fix"
						use:enhance={() =>
							({ update }) => {
								editId = null;
								return update();
							}}
					>
						<input type="hidden" name="id" value={e.id} />
						{@render fields(e)}
						<label class="h-check"
							><input type="checkbox" name="dismissed" checked={e.dismissed} /> Hide from Home</label
						>
						<div class="h-actions">
							<button class="btn primary">Save</button>
							<button class="btn danger" formaction="?/delete" formnovalidate>Delete</button>
						</div>
					</form>
				{/if}
			</div>
		{/each}
	</section>

	<section class="card">
		<span class="lbl">Add a date</span>
		<form method="POST" action="?/add" class="h-form" use:enhance>
			{@render fields()}
			<div class="h-actions">
				<button class="btn primary">Add</button>
				{#if form?.error}<span class="h-error" role="alert">{form.error}</span>{/if}
			</div>
		</form>
	</section>
</div>

<style>
	.grid {
		display: grid;
		gap: 12px;
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
	p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
	.item {
		border-top: 1px solid var(--surface-2);
	}
	.item.past {
		opacity: 0.6;
	}
	.row-top {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 56px;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.edit {
		min-height: 44px;
		min-width: 44px;
		border: 0;
		background: transparent;
		color: var(--link);
		font: 600 13px var(--font-body);
		cursor: pointer;
	}
	.fix {
		padding: 4px 0 14px;
	}
</style>
