<script lang="ts">
	import '../../Estilos/variables.css';
	import '../../Estilos/global.css';
	import '../../Estilos/componentes.css';
	import '../../Estilos/layout.css';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const links = [
		{ href: resolve('/'), label: 'Convertir' },
		{ href: resolve('/ayuda'), label: 'Sintaxis y métodos' }
	];
</script>

<a class="skip-link" href="#contenido">Saltar al contenido</a>
<div class="app">
	<header class="app-header">
		<a class="brand" href={resolve('/')}>
			<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
				<path d="M2 32h9" stroke="#1f2b38" stroke-width="3.5" />
				<path d="M9 26l7 6-7 6z" fill="#1f2b38" />
				<circle cx="38" cy="32" r="22" fill="#fff" stroke="#1f2b38" stroke-width="3.5" />
				<circle cx="38" cy="32" r="15" fill="#dbe4f5" stroke="#2a4a86" stroke-width="3.5" />
				<text x="38" y="38.5" font-family="IBM Plex Mono, monospace" font-size="17" font-weight="700" text-anchor="middle" fill="#1b3366">q₀</text>
			</svg>
			<span>
				<span class="brand-title">Autómatas</span>
				<p class="brand-sub">De expresiones regulares a autómatas finitos, paso a paso</p>
			</span>
		</a>
		<nav class="nav" aria-label="Principal">
			{#each links as link (link.href)}
				<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>{link.label}</a>
			{/each}
		</nav>
	</header>
	{@render children()}
</div>
