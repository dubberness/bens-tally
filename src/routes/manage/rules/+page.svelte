<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';

	let { data, form } = $props();
</script>

<svelte:head><title>Rules · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp h-title">Rules</h1>

<div class="wrap">
	<section class="card">
		<p class="sub">
			Rules sort Up transactions: which budget line they count toward, or whether they are kept out
			of your spending (paid for someone else, a loan repayment, investing…). The first rule that
			matches wins, so put specific rules above broad ones. A choice you make by hand on a
			transaction always beats the rules.
		</p>
		<div class="h-actions">
			<a class="btn primary" href="/manage/rules/new">Add a rule</a>
			<form method="POST" action="?/suggest" use:enhance>
				<button class="btn">Make rules from budget line names</button>
			</form>
			{#if form && 'suggested' in form}<span class="h-ok" role="status"
					>{form.suggested
						? `${form.suggested} rule${form.suggested === 1 ? '' : 's'} added`
						: 'No line names match a merchant yet'}</span
				>{/if}
		</div>
	</section>

	<section class="card list" aria-label="Rules in the order they are tried">
		{#each data.rules as r, i (r.id)}
			<div class="row" class:off={!r.enabled}>
				<a class="grow main" href="/manage/rules/{r.id}">
					<span class="name">{r.name}</span>
					<span class="sub small">{r.describe}</span>
					<span class="sub small">
						{r.actionLabel}{r.line ? ` · ${r.line}` : ''}{r.label ? ` · ${r.label}` : ''} ·
						{r.count} sorted
					</span>
				</a>
				<div class="tools">
					<form method="POST" action="?/toggle" use:enhance>
						<input type="hidden" name="id" value={r.id} />
						<input type="hidden" name="enabled" value={r.enabled ? '0' : '1'} />
						<button class="btn small" aria-label="{r.enabled ? 'Switch off' : 'Switch on'} {r.name}"
							>{r.enabled ? 'On' : 'Off'}</button
						>
					</form>
					<form method="POST" action="?/move" use:enhance>
						<input type="hidden" name="id" value={r.id} />
						<input type="hidden" name="dir" value="up" />
						<button class="btn small" disabled={i === 0} aria-label="Move {r.name} up">↑</button>
					</form>
					<form method="POST" action="?/move" use:enhance>
						<input type="hidden" name="id" value={r.id} />
						<input type="hidden" name="dir" value="down" />
						<button
							class="btn small"
							disabled={i === data.rules.length - 1}
							aria-label="Move {r.name} down">↓</button
						>
					</form>
				</div>
			</div>
		{:else}
			<p class="sub">
				No rules yet. Add one for each place you shop or bill you pay, or make a start from the
				names on your budget lines.
			</p>
		{/each}
	</section>
</div>

<style>
	.wrap {
		display: grid;
		gap: 12px;
		max-width: 720px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	p {
		margin: 0;
	}
	form {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
	.row.off .main {
		opacity: 0.55;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		color: var(--text);
		text-decoration: none;
		min-height: 44px;
		justify-content: center;
		overflow-wrap: anywhere;
	}
	.name {
		font-weight: 600;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.tools {
		display: flex;
		gap: 6px;
	}
	.btn.small {
		min-width: 44px;
		padding: 0 12px;
		font-size: 13px;
	}
</style>
