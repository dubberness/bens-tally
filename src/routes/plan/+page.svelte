<script lang="ts">
	import PlanView from '$lib/components/plan/PlanView.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Plan · Ben's Tally</title></svelte:head>

<header class="head">
	<h1 class="disp page-title">Plan</h1>
</header>

{#if data.scenarios.length > 1 || data.selected.id !== 0}
	<nav class="chips" aria-label="Scenarios">
		{#each data.scenarios as s (s.id)}
			<a
				class="chip"
				class:on={s.id === data.selected.id}
				href="/plan?s={s.id}"
				aria-current={s.id === data.selected.id ? 'true' : undefined}
				>{s.name}{#if s.isDefault}<span class="star" title="Base scenario"> ★</span>{/if}</a
			>
		{/each}
	</nav>
{/if}

{#key data.selected.id}
	<PlanView scenario={data.selected} ctx={data.ctx} {form} />
{/key}

<style>
	.head {
		margin-bottom: 10px;
	}
	.page-title {
		margin: 0;
		font-size: 34px;
		letter-spacing: -0.02em;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 14px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1px solid #33333a;
		background: var(--inset);
		color: var(--chip-text);
		font: 600 13px var(--font-body);
		text-decoration: none;
	}
	.chip.on {
		background: var(--text);
		color: var(--ground);
		border-color: var(--text);
	}
	.star {
		color: var(--accent);
		margin-left: 4px;
	}
	.chip.on .star {
		color: var(--accent-ink);
	}
</style>
