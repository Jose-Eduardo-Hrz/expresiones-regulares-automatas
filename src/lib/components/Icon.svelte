<script lang="ts" module>
	/** Trazos de los íconos (24×24, estilo de línea). */
	const PATHS = {
		'zoom-in': 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6',
		'zoom-out': 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
		fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 12h6',
		layout: 'M5 6h4v4H5zM15 14h4v4h-4zM15 4h4v4h-4zM9 8h6M9 8l6 8',
		download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
		play: 'M8 5l11 7-11 7z',
		pause: 'M8 5v14M16 5v14',
		prev: 'M15 5l-7 7 7 7',
		next: 'M9 5l7 7-7 7',
		first: 'M6 5v14M18 5l-7 7 7 7',
		last: 'M18 5v14M6 5l7 7-7 7',
		reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
		check: 'M5 12l5 5 9-10',
		x: 'M6 6l12 12M18 6L6 18',
		info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
		alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
		trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
		bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
		close: 'M6 6l12 12M18 6L6 18'
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, size = 16, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={name === 'play' ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width="2.2"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	<path d={PATHS[name]} />
</svg>
