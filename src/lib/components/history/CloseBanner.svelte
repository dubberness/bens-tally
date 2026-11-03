<script lang="ts">
	import { monthName } from '$lib/time';

	let { month, overdueDays = 0 }: { month: string; overdueDays?: number } = $props();
	const name = $derived(monthName(month, { year: false }));
</script>

<a class="banner" href="/months/close">
	<span>
		<strong>Close {name}</strong>
		<span class="sub"
			>{overdueDays > 0
				? `It ended ${overdueDays} day${overdueDays === 1 ? '' : 's'} ago.`
				: 'Its last day is here.'} About a minute.</span
		>
	</span>
	<span class="go" aria-hidden="true">→</span>
</a>

<style>
	.banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 56px;
		padding: 10px 16px;
		border-radius: 16px;
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
		color: var(--text);
		text-decoration: none;
	}
	.banner:hover {
		color: var(--text);
		border-color: var(--accent);
	}
	strong {
		display: block;
		font-size: 15px;
	}
	.go {
		color: var(--accent);
		font-size: 18px;
		font-weight: 700;
	}
</style>
