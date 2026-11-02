<script lang="ts">
	import Wordmark from '$lib/components/Wordmark.svelte';

	let { data } = $props();
	const href = $derived(
		data.to === '/' ? '/auth/login' : `/auth/login?to=${encodeURIComponent(data.to)}`
	);
</script>

<svelte:head><title>Sign in · Ben's Tally</title></svelte:head>

<main class="wrap">
	<div class="box">
		<Wordmark size={30} />
		<p class="sub">Your money, month by month.</p>
		{#if data.error}
			<p class="note loss" role="alert">{data.error}</p>
		{:else if data.signedOut}
			<p class="note" role="status">You're signed out.</p>
		{/if}
		<a class="btn primary" {href}>Sign in with Pocket-ID</a>
	</div>
</main>

<style>
	.wrap {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px var(--gutter);
	}
	.box {
		width: 100%;
		max-width: 360px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		text-align: center;
	}
	.box p {
		margin: 0;
	}
	.note {
		font-size: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-tile);
		padding: 10px 14px;
		width: 100%;
	}
	.btn {
		width: 100%;
		margin-top: 8px;
	}
</style>
