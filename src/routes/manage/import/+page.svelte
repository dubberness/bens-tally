<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import { shortDateTime } from '$lib/time';

	let { data, form } = $props();
	let busy = $state(false);
	// svelte-ignore state_referenced_locally
	let part = $state(data.closed ? (data.parts[0]?.id ?? 'all') : 'all');

	const counts = $derived(
		data.last
			? {
					ok: data.last.lines.filter((l) => l.level === 'ok').length,
					warn: data.last.lines.filter((l) => l.level === 'warn').length,
					fail: data.last.lines.filter((l) => l.level === 'fail').length
				}
			: null
	);
</script>

<svelte:head><title>Sheet import · Ben's Tally</title></svelte:head>

<a class="back" href="/manage"><Icon name="back" size={18} /> Manage</a>
<h1 class="disp page-title">Sheet import</h1>

<div class="grid">
	<section class="card">
		<span class="lbl">Load from the sheet</span>
		{#if data.closed && !data.parts.length}
			<p class="sub">The app is now the record, so the sheet import is switched off.</p>
		{:else}
			{#if data.closed}
				<p class="sub">
					The app is now the record, so only a part the sheet never loaded can still come in.
				</p>
			{:else}
				<p class="sub">
					In Google Sheets choose File › Download › Microsoft Excel (.xlsx), then pick that file
					here. The file itself isn't kept.
				</p>
			{/if}
			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
			>
				<label class="file">
					<span class="sub small">Sheet export</span>
					<input type="file" name="file" accept=".xlsx" required />
				</label>
				{#if data.anyLoaded && data.parts.length}
					<fieldset class="parts">
						<legend class="sub small">What to load</legend>
						{#if !data.closed}
							<label class="check"
								><input type="radio" name="part" value="all" bind:group={part} /> Everything again</label
							>
						{/if}
						{#each data.parts as p (p.id)}
							<label class="check"
								><input type="radio" name="part" value={p.id} bind:group={part} />
								{p.label} only{p.loaded ? '' : ' (not loaded yet)'}</label
							>
						{/each}
					</fieldset>
				{:else}
					<input type="hidden" name="part" value="all" />
				{/if}
				{#if part === 'all' && data.anyLoaded}
					<p class="sub small">
						Everything again removes what the last import made, accounts included, and loads it
						afresh. Links and calculations you set on the sheet's accounts (an Up saver link, a
						loan's terms) go with them, so load just one part when that's all you need.
					</p>
				{/if}
				<button class="btn primary" disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
			</form>
		{/if}
		{#if form?.message}<p class="loss small" role="alert">{form.message}</p>{/if}
	</section>

	{#if data.last && counts}
		<section class="card">
			<div class="head">
				<span class="lbl">Last import</span>
				<span class="sub small">{shortDateTime(new Date(data.last.at))}</span>
			</div>
			<p class="sub small">
				{data.last.fileName} ·
				<span class:gain={data.last.ok} class:loss={!data.last.ok}
					>{data.last.ok ? 'Loaded' : 'Problems found'}</span
				>
				· {counts.ok} matched, {counts.warn} to look at, {counts.fail} failed
			</p>
			<ul class="report">
				{#each data.last.lines as l, i (i)}
					<li class="line {l.level}">
						<span class="badge"
							>{l.level === 'ok' ? '✓' : l.level === 'warn' ? '!' : '✕'} {l.area}</span
						>
						<span>{l.message}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if !data.closed}
		<section class="card">
			<span class="lbl">Go live</span>
			<p class="sub">
				Once the app has matched the sheet for two month-ends, switch the import off so a stray
				re-run can't replace history.
			</p>
			<form method="POST" action="?/close" use:enhance>
				<label class="check"
					><input type="checkbox" name="confirm" value="yes" /> The app is now my record</label
				>
				<button class="btn">Switch off the sheet import</button>
			</form>
		</section>
	{/if}
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 44px;
		color: var(--text-2);
		text-decoration: none;
	}
	.page-title {
		font-size: 28px;
		letter-spacing: -0.02em;
		margin: 0 0 14px;
	}
	.grid {
		display: grid;
		gap: 12px;
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
	.parts {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
		margin: 0;
	}
	.file {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
		min-height: 44px;
	}
	.small {
		font-size: 12px;
	}
	p {
		margin: 0;
	}
	.report {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
	}
	.line {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.line.warn .badge {
		color: var(--estimate);
	}
	.line.fail .badge {
		color: var(--loss);
	}
	.line.ok .badge {
		color: var(--gain);
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
</style>
