<script lang="ts">
	let { data } = $props();
	const first = $derived(data.user?.name?.split(' ')[0]);
</script>

<svelte:head><title>Ben's Tally</title></svelte:head>

<section class="hero">
	<span class="lbl">Net worth</span>
	<span class="disp num big" aria-label="No figures yet">—</span>
	<span class="sub">Nothing tracked yet{first ? `, ${first}` : ''}.</span>
</section>

<div class="grid">
	<section class="card next">
		<span class="lbl" style="color: var(--accent)">What's next</span>
		<ol>
			<li>
				<strong>Bring in your history</strong>
				<span class="sub"
					>Every month-end from the Personal Wealth sheet, checked to the dollar.</span
				>
			</li>
			<li>
				<strong>Connect Up</strong>
				<span class="sub"
					>Live cash and spending, and closing the month in a couple of minutes.</span
				>
			</li>
			<li>
				<strong>Investments from email</strong>
				<span class="sub"
					>Betashares buys, sells and distributions, the moment the email arrives.</span
				>
			</li>
		</ol>
	</section>

	<a href="/manage" class="card status">
		<span class="lbl">Running</span>
		<span class="sub"
			>Signed in{data.user?.email ? ` as ${data.user.email}` : ''}. Backups run nightly.</span
		>
		<span class="more">Manage →</span>
	</a>
</div>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 6px 4px 18px;
	}
	.big {
		font-size: 52px;
		line-height: 1;
		font-weight: 750;
		letter-spacing: -0.03em;
		color: var(--text-3);
	}
	.grid {
		display: grid;
		gap: 12px;
	}
	ol {
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
		counter-reset: step;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	li {
		counter-increment: step;
		display: grid;
		grid-template-columns: 32px 1fr;
		column-gap: 12px;
		row-gap: 2px;
	}
	li::before {
		content: counter(step);
		grid-row: span 2;
		width: 32px;
		height: 32px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--accent);
		font: 700 15px var(--font-display);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	li strong {
		font-size: 15px;
	}
	.status {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-decoration: none;
		color: var(--text);
	}
	.more {
		font-size: 13px;
		font-weight: 600;
		color: var(--link);
		margin-top: 4px;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: 2fr 1fr;
			align-items: start;
		}
	}
</style>
