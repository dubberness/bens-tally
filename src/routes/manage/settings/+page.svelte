<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import '$lib/components/history/form.css';

	let { data, form } = $props();
	const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const h = $derived(data.help);
</script>

<svelte:head><title>Settings · Ben's Tally</title></svelte:head>

<a class="h-back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp h-title">Settings</h1>

<form
	method="POST"
	action="?/save"
	class="h-form grid"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
>
	<section class="card">
		<span class="lbl">Money and months</span>
		<label class="h-label"
			>{h.payday.label}
			<select class="h-select" name="payday">
				<option value="" selected={data.prefs.payday == null}>Not set</option>
				{#each DAYS as d, i (d)}<option value={i} selected={data.prefs.payday === i}>{d}</option
					>{/each}
			</select>
			<span class="sub small">{h.payday.help}</span></label
		>
		<label class="h-label"
			>{h.closeTime.label}
			<input class="h-input" type="time" name="closeTime" value={data.prefs.closeTime} />
			<span class="sub small">{h.closeTime.help}</span></label
		>
		<label class="h-label"
			>{h.sureBp.label}
			<span class="h-money"
				><input name="sure" inputmode="decimal" value={data.prefs.sureBp / 100} /><span class="cur"
					>%</span
				></span
			>
			<span class="sub small">{h.sureBp.help}</span></label
		>
	</section>

	<section class="card">
		<span class="lbl">You</span>
		<label class="h-label"
			>{h.birthDate.label}
			<input class="h-input" type="date" name="birthDate" value={data.prefs.birthDate ?? ''} />
			<span class="sub small">{h.birthDate.help}</span></label
		>
		<label class="h-label"
			>{h.theme.label}
			<select class="h-select" name="theme">
				<option value="dark" selected={data.prefs.theme === 'dark'}>Dark</option>
				<option value="light" selected={data.prefs.theme === 'light'}>Light</option>
				<option value="system" selected={data.prefs.theme === 'system'}>Follow the phone</option>
			</select>
			<span class="sub small">{h.theme.help}</span></label
		>
	</section>

	<section class="card">
		<span class="lbl">Investable accounts</span>
		<p class="sub small">
			Home’s Investable view counts only these, for example cash and ETFs but not super or the home.
		</p>
		{#if !data.accounts.length}<p class="sub">No accounts yet.</p>{/if}
		{#each data.accounts as a (a.id)}
			<label class="h-check"
				><input type="checkbox" name="investable" value={a.id} checked={a.investable} />
				{a.name}</label
			>
		{/each}
	</section>

	<div class="h-actions save">
		<button class="btn primary">Save settings</button>
		{#if form?.saved}<span class="h-ok" role="status">Saved</span>{/if}
		{#if form?.error}<span class="h-error" role="alert">{form.error}</span>{/if}
	</div>
</form>

<style>
	.grid {
		display: grid;
		gap: 12px;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
			column-gap: 20px;
		}
		.save {
			grid-column: 1 / -1;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
</style>
