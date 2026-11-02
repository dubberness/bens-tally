<script lang="ts">
	let { title, what }: { title: string; what: string } = $props();
</script>

<svelte:head><title>{title} · Ben's Tally</title></svelte:head>

<h1 class="disp page-title">{title}</h1>
<section class="card soon">
	<span class="lbl" style="color: var(--accent)">Coming soon</span>
	<p class="sub">{what}</p>
</section>

<style>
	.page-title {
		font-size: 28px;
		letter-spacing: -0.02em;
		margin: 4px 0 14px;
	}
	.soon {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 560px;
	}
	.soon p {
		margin: 0;
	}
</style>
