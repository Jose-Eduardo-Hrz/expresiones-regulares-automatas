<script lang="ts">
	import { formatSet } from '#lib/automata/core.ts';
	import { layoutTree, type TreeNodeView } from '#lib/visualization/treeLayout.ts';

	interface Props {
		nodes: TreeNodeView[];
		/** Mostrar nullable, firstpos (izquierda) y lastpos (derecha). */
		annotated?: boolean;
		/** Nodos con funciones ya calculadas; si se omite, todos. */
		computed?: number[];
		highlight?: number[];
		/** Ocupar todo el alto disponible (área principal). */
		fill?: boolean;
		title: string;
	}

	let { nodes, annotated = false, computed, highlight = [], fill = false, title }: Props = $props();

	const layout = $derived(layoutTree(nodes, annotated));
	const computedSet = $derived(computed ? new Set(computed) : null);
	const highlightSet = $derived(new Set(highlight));
	const isComputed = (id: number): boolean => !computedSet || computedSet.has(id);
	const byId = $derived(new Map(layout.nodes.map((n) => [n.id, n])));
</script>

<figure class="tree" class:fill>
	<svg
		viewBox={`0 0 ${layout.width} ${layout.height}`}
		preserveAspectRatio="xMidYMin meet"
		role="img"
		aria-label={title}
		style:max-width={fill ? undefined : `${Math.max(layout.width, 160)}px`}
	>
		{#each layout.nodes as n (n.id)}
			{#each n.children as c (c)}
				{@const child = byId.get(c)}
				{#if child}
					<line x1={n.x} y1={n.y + 15} x2={child.x} y2={child.y - 15} class="link" />
				{/if}
			{/each}
		{/each}
		{#each layout.nodes as n (n.id)}
			{@const hl = highlightSet.has(n.id)}
			<g class="node" class:hl class:leaf={n.children.length === 0}>
				<title>{n.text}</title>
				<circle cx={n.x} cy={n.y} r="15" />
				<text x={n.x} y={n.y} class="node-label">{n.label}</text>
				{#if n.position !== undefined}
					<text x={n.x} y={n.y + 28} class="pos">{n.position}</text>
				{/if}
				{#if annotated && isComputed(n.id)}
					<text x={n.x - 20} y={n.y} class="first">{formatSet(n.firstpos ?? [])}</text>
					<text x={n.x + 20} y={n.y} class="last">{formatSet(n.lastpos ?? [])}</text>
					{#if n.nullable}
						<text x={n.x} y={n.y - 24} class="nullable">anulable</text>
					{/if}
				{/if}
			</g>
		{/each}
	</svg>
	{#if annotated}
		<figcaption>
			<span class="key first-key">{'{…}'} izquierda: firstpos</span>
			<span class="key last-key">derecha: lastpos {'{…}'}</span>
			<span class="key">«anulable»: nullable = verdadero</span>
			<span class="key">número bajo la hoja: posición</span>
		</figcaption>
	{/if}
</figure>

<style>
	.tree {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		overflow: auto;
	}

	.tree.fill {
		height: 100%;
		padding: var(--sp-3);
	}

	svg {
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.fill svg {
		flex: 1;
		min-height: 0;
		height: 100%;
		max-height: 100%;
	}

	.link {
		stroke: var(--navy);
		stroke-width: 1.8;
	}

	.node circle {
		fill: var(--card);
		stroke: var(--navy);
		stroke-width: 2.2;
	}

	.node.leaf circle {
		fill: var(--surface);
	}

	.node.hl circle {
		fill: var(--accent-l);
		stroke: var(--accent-d);
		stroke-width: 3.5;
	}

	text {
		font-family: var(--mono);
		dominant-baseline: central;
	}

	.node-label {
		font-size: 15px;
		font-weight: 600;
		text-anchor: middle;
		fill: var(--navy);
	}

	.pos {
		font-size: 11px;
		text-anchor: middle;
		fill: var(--muted);
	}

	.first {
		font-size: 11.5px;
		text-anchor: end;
		fill: var(--accent);
	}

	.last {
		font-size: 11.5px;
		text-anchor: start;
		fill: var(--green);
	}

	.nullable {
		font-size: 9.5px;
		text-anchor: middle;
		fill: #7a4f00;
		font-weight: 600;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--sp-1) var(--sp-3);
		font-size: var(--fs-xs);
		color: var(--muted);
	}

	.first-key {
		color: var(--accent);
	}

	.last-key {
		color: var(--green);
	}
</style>
