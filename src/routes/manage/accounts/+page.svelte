<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';

	let { data, form } = $props();
	let kind = $state('cash');
	const open = $derived(data.accounts.filter((a) => !a.closedOn));
	const closed = $derived(data.accounts.filter((a) => a.closedOn));
	const notListed = $derived(open.filter((a) => a.closeOrder == null));
	const SOURCE: Record<string, string> = {
		manual: 'You',
		calculated: 'Calculated',
		up: 'Up',
		betashares: 'Betashares'
	};
</script>

<svelte:head><title>Accounts · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp h-title">Accounts</h1>

<div class="grid">
	<div class="col">
		<section class="card">
			<span class="lbl">Your accounts</span>
			{#if !open.length}<p class="sub">
					No accounts yet. Add one below or bring in the sheet.
				</p>{/if}
			<ul class="list">
				{#each open as a, i (a.id)}
					<li class="item">
						<a class="grow name" href="/manage/accounts/{a.id}">
							<span class="strong">{a.name}</span>
							<span class="sub small"
								>{a.kind} · {SOURCE[a.source] ?? a.source}{a.investable
									? ' · investable'
									: ''}</span
							>
						</a>
						<span class="num strong">{a.value}</span>
						<form method="POST" action="?/move" use:enhance class="mv">
							<input type="hidden" name="id" value={a.id} />
							<button
								class="icon"
								name="dir"
								value="up"
								disabled={i === 0}
								aria-label="Move {a.name} up">↑</button
							>
							<button
								class="icon"
								name="dir"
								value="down"
								disabled={i === open.length - 1}
								aria-label="Move {a.name} down">↓</button
							>
						</form>
					</li>
				{/each}
			</ul>
			{#if closed.length}
				<details>
					<summary class="sub">Closed accounts ({closed.length})</summary>
					<ul class="list">
						{#each closed as a (a.id)}
							<li class="item">
								<a class="grow name" href="/manage/accounts/{a.id}"
									><span class="strong">{a.name}</span><span class="sub small"
										>Closed {a.closedOn}</span
									></a
								>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</section>

		<section class="card">
			<span class="lbl">Add an account</span>
			<form method="POST" action="?/add" class="h-form" use:enhance>
				<label class="h-label"
					>Name <input class="h-input" name="name" required autocomplete="off" /></label
				>
				<div class="h-row2">
					<label class="h-label"
						>Kind
						<select class="h-select" name="kind" bind:value={kind}>
							{#each data.kinds as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
						</select></label
					>
					<label class="h-label"
						>Owned or owed
						<select class="h-select" name="side" disabled={kind === 'loan'}>
							<option value="asset">Owned</option>
							<option value="liability" selected={kind === 'loan'}>Owed</option>
						</select></label
					>
					<label class="h-label"
						>Value comes from
						<select class="h-select" name="source">
							<option value="manual">You type it</option>
							<option value="calculated">A calculation</option>
							<option value="up">Up</option>
							<option value="betashares">Betashares</option>
						</select></label
					>
				</div>
				<div class="h-actions">
					<button class="btn primary">Add account</button>
					{#if form?.addError}<span class="h-error" role="alert">{form.addError}</span>{/if}
					{#if form?.added}<span class="h-ok" role="status">Added {form.added}</span>{/if}
				</div>
			</form>
		</section>
	</div>

	<div class="col">
		<section class="card" id="close">
			<span class="lbl">Close the month list</span>
			<p class="sub small">
				Which accounts appear on Close the month, and in what order. The others still count.
			</p>
			<ul class="list">
				{#each data.closeList as a, i (a.id)}
					<li class="item">
						<span class="grow strong">{a.name}</span>
						<form method="POST" action="?/move" use:enhance class="mv">
							<input type="hidden" name="id" value={a.id} />
							<input type="hidden" name="list" value="close" />
							<button
								class="icon"
								name="dir"
								value="up"
								disabled={i === 0}
								aria-label="Move {a.name} up">↑</button
							>
							<button
								class="icon"
								name="dir"
								value="down"
								disabled={i === data.closeList.length - 1}
								aria-label="Move {a.name} down">↓</button
							>
						</form>
						<form method="POST" action="?/closeList" use:enhance>
							<input type="hidden" name="id" value={a.id} />
							<button class="icon" name="op" value="remove" aria-label="Take {a.name} off the list"
								>✕</button
							>
						</form>
					</li>
				{/each}
			</ul>
			{#if notListed.length}
				<form method="POST" action="?/closeList" use:enhance class="h-form inline">
					<select class="h-select" name="id" aria-label="Account to add to the list">
						{#each notListed as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
					</select>
					<button class="btn" name="op" value="add">Add to list</button>
				</form>
			{/if}
		</section>

		{#if open.length > 1}
			<section class="card">
				<span class="lbl">Merge two accounts</span>
				<p class="sub small">
					Everything on the second account (entries, month values, transactions, pay splits, budget
					lines, funds) moves to the first, then the second is deleted. Month values are added
					together.
				</p>
				<form method="POST" action="?/merge" class="h-form" use:enhance>
					<label class="h-label"
						>Keep
						<select class="h-select" name="keep">
							{#each data.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
						</select></label
					>
					<label class="h-label"
						>Merge into it and delete
						<select class="h-select" name="remove">
							{#each data.accounts as a, i (a.id)}<option value={a.id} selected={i === 1}
									>{a.name}</option
								>{/each}
						</select></label
					>
					<label class="h-check"
						><input type="checkbox" name="confirm" value="yes" /> I understand this can’t be undone</label
					>
					<div class="h-actions">
						<button class="btn">Merge</button>
						{#if form?.mergeError}<span class="h-error" role="alert">{form.mergeError}</span>{/if}
						{#if form?.merged}<span class="h-ok" role="status">Merged</span>{/if}
					</div>
				</form>
			</section>
		{/if}
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
	.strong {
		font-weight: 600;
	}
	.small {
		font-size: 12px;
	}
	.mv {
		display: flex;
		margin: 0;
	}
	form {
		margin: 0;
	}
	.icon {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		border: 0;
		background: transparent;
		color: var(--text-2);
		font-size: 16px;
		cursor: pointer;
	}
	.icon:hover:not(:disabled) {
		color: var(--text);
		background: var(--surface-2);
	}
	.icon:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.inline {
		flex-direction: row;
		align-items: center;
	}
	.inline .h-select {
		flex: 1;
	}
	summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		cursor: pointer;
	}
</style>
