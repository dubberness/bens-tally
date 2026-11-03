<script lang="ts">
	// Line icons from the concept, drawn at 24 × 24.
	const paths = {
		home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
		months:
			'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
		budget:
			'<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v2.5"/><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M16 13.5h1.5"/>',
		invest: '<path d="M3.5 17 9 11.5l4 4L20.5 8"/><path d="M15 8h5.5v5.5"/>',
		plan: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
		settings:
			'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
		back: '<path d="M15 5l-7 7 7 7"/>',
		next: '<path d="M9 5l7 7-7 7"/>'
	} as const;

	let { name, size = 22 }: { name: keyof typeof paths; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true">{@html paths[name]}</svg
>
