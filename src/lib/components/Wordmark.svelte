<script lang="ts">
	let { size = 22 }: { size?: number } = $props();
</script>

<span class="wordmark disp" style:font-size="{size}px">
	<svg width={size * 0.95} height={size * 0.95} viewBox="0 0 32 32" aria-hidden="true">
		<g stroke="var(--accent)" stroke-width="3" stroke-linecap="round">
			<path d="M7 6v20M12.5 6v20M18 6v20M23.5 6v20" />
			<path d="M4 22 27 10" />
		</g>
	</svg>
	Ben's Tally
</span>

<style>
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		font-weight: 750;
		letter-spacing: -0.02em;
		color: var(--text);
	}
</style>
