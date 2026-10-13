<script lang="ts" module>
	import type { Transition } from '#lib/automata/types.ts';

	export type GraphSelection =
		| { type: 'state'; id: string }
		| { type: 'edge'; from: string; to: string; transitions: Transition[] };
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Core, ElementDefinition, LayoutOptions } from 'cytoscape';
	import { cytoscape } from '#lib/visualization/cy.ts';
	import type { Automaton } from '#lib/automata/types.ts';
	import { AUTOMATON_NAMES } from '#lib/automata/types.ts';
	import {
		START_GHOST,
		blockIndex,
		edgeLabel,
		groupTransitions,
		isSinkState,
		nodeWidth,
		type EdgeGroup,
		type GraphDecoration
	} from '#lib/visualization/graphModel.ts';
	import { buildStylesheet, readPalette } from '#lib/visualization/cytoscapeStyle.ts';
	import { downloadBlob, exportFilename, graphToSvg } from '#lib/visualization/exportGraph.ts';
	import Icon from './Icon.svelte';

	interface Props {
		automaton: Automaton | null;
		decoration?: GraphDecoration;
		/** Expresión regular, para el nombre de archivo y la descripción accesible. */
		regex?: string;
		selectedState?: string | null;
		onselect?: (selection: GraphSelection | null) => void;
	}

	let { automaton, decoration = {}, regex = '', selectedState = null, onselect }: Props = $props();

	let container = $state<HTMLDivElement | undefined>();
	let cy: Core | undefined;
	let current: Automaton | null = null;
	let groups: EdgeGroup[] = [];
	let groupById = new Map<string, EdgeGroup>();
	let nodeOf = new Map<string, string>();
	let resizeObserver: ResizeObserver | undefined;
	let exportError = $state('');
	const palette = readPalette();

	const layoutOptions = {
		name: 'dagre',
		rankDir: 'LR',
		nodeSep: 34,
		rankSep: 60,
		edgeSep: 18,
		fit: false,
		animate: false
	} as LayoutOptions;

	function init(el: HTMLDivElement): Core {
		const instance = cytoscape({
			container: el,
			style: buildStylesheet(palette),
			minZoom: 0.08,
			maxZoom: 4,
			boxSelectionEnabled: false,
			selectionType: 'single'
		});
		instance.on('tap', 'node', (evt) => {
			const id = evt.target.data('stateId') as string | undefined;
			if (id !== undefined) onselect?.({ type: 'state', id });
		});
		instance.on('tap', 'edge', (evt) => {
			const g = groupById.get(evt.target.id());
			if (g) onselect?.({ type: 'edge', from: g.from, to: g.to, transitions: g.transitions });
		});
		instance.on('tap', (evt) => {
			if (evt.target === instance) onselect?.(null);
		});
		resizeObserver = new ResizeObserver(() => instance.resize());
		resizeObserver.observe(el);
		return instance;
	}

	function rebuild(a: Automaton | null): void {
		if (!cy) return;
		const instance = cy;
		groups = a ? groupTransitions(a) : [];
		groupById = new Map(groups.map((g) => [g.id, g]));
		nodeOf = new Map(a ? a.states.map((s, i) => [s.id, `s${i}`]) : []);
		const elements: ElementDefinition[] = [];
		if (a) {
			const accepting = new Set(a.accepting);
			elements.push({ group: 'nodes', data: { id: START_GHOST, label: '', w: 2 } });
			for (const s of a.states) {
				const classes = [
					s.id === a.start ? 'start' : '',
					accepting.has(s.id) ? 'accepting' : '',
					isSinkState(a, s.id) ? 'sink' : ''
				].filter(Boolean);
				elements.push({
					group: 'nodes',
					data: { id: nodeOf.get(s.id), stateId: s.id, label: s.id, w: nodeWidth(s.id) },
					classes
				});
			}
			elements.push({
				group: 'edges',
				data: { id: '__flecha_inicio__', source: START_GHOST, target: nodeOf.get(a.start), label: '' },
				classes: 'start-arrow'
			});
			for (const g of groups) {
				elements.push({
					group: 'edges',
					data: { id: g.id, source: nodeOf.get(g.from), target: nodeOf.get(g.to), label: edgeLabel(g.transitions) },
					classes: g.transitions.every((t) => t.symbol === null) ? 'epsilon' : ''
				});
			}
		}
		instance.batch(() => {
			instance.elements().remove();
			instance.add(elements);
		});
		if (a) relayout();
	}

	function applyDecoration(a: Automaton | null, d: GraphDecoration): void {
		if (!cy || !a) return;
		const instance = cy;
		const visibleStates = new Set(a.states.slice(0, d.visibleStates ?? a.states.length).map((s) => s.id));
		const visibleTransitions = new Set(a.transitions.slice(0, d.visibleTransitions ?? a.transitions.length).map((t) => t.id));
		const h = d.highlight;
		const hlStates = new Set(h?.states ?? []);
		const hlTransitions = new Set(h?.transitions ?? []);
		const ctxStates = new Set(h?.contextStates ?? []);
		const ctxTransitions = new Set(h?.contextTransitions ?? []);
		const focused = hlStates.size + hlTransitions.size + ctxStates.size + ctxTransitions.size > 0;
		const blocks = blockIndex(d.partition);
		const accepting = new Set(a.accepting);

		instance.batch(() => {
			for (const s of a.states) {
				const node = instance.getElementById(nodeOf.get(s.id) as string);
				const block = blocks.get(s.id);
				node.toggleClass('start', !d.hideRoles && s.id === a.start);
				node.toggleClass('accepting', !d.hideRoles && accepting.has(s.id));
				node.removeClass('hidden hl ctx dim sim-accepted sim-rejected partitioned block-0 block-1 block-2 block-3 block-4 block-5 block-6 block-7');
				if (!visibleStates.has(s.id)) node.addClass('hidden');
				if (hlStates.has(s.id)) node.addClass('hl');
				else if (ctxStates.has(s.id)) node.addClass('ctx');
				else if (focused) node.addClass('dim');
				if (block !== undefined) {
					node.addClass(`partitioned block-${block % 8}`);
					node.data('label', `${s.id}\nB${block + 1}`);
					node.data('w', nodeWidth(`${s.id}\nB${block + 1}`));
				} else {
					node.data('label', s.id);
					node.data('w', nodeWidth(s.id));
				}
				if (d.verdict && hlStates.has(s.id)) {
					if (d.verdict === 'accepted' && accepting.has(s.id)) node.addClass('sim-accepted');
					if (d.verdict === 'rejected') node.addClass('sim-rejected');
				}
			}
			const startVisible = visibleStates.has(a.start) && !d.hideRoles;
			instance.getElementById(START_GHOST).toggleClass('hidden', !startVisible);
			instance.getElementById('__flecha_inicio__').toggleClass('hidden', !startVisible);
			for (const g of groups) {
				const edge = instance.getElementById(g.id);
				const shown = g.transitions.filter((t) => visibleTransitions.has(t.id));
				edge.removeClass('hidden hl ctx dim');
				if (shown.length === 0 || !visibleStates.has(g.from) || !visibleStates.has(g.to)) {
					edge.addClass('hidden');
					continue;
				}
				edge.data('label', edgeLabel(shown));
				edge.toggleClass('epsilon', shown.every((t) => t.symbol === null));
				if (shown.some((t) => hlTransitions.has(t.id))) edge.addClass('hl');
				else if (shown.some((t) => ctxTransitions.has(t.id))) edge.addClass('ctx');
				else if (focused) edge.addClass('dim');
			}
		});
	}

	$effect(() => {
		const a = automaton;
		const d = decoration;
		if (!container) return;
		if (!cy) cy = init(container);
		if (a !== current) {
			current = a;
			rebuild(a);
		}
		applyDecoration(a, d);
	});

	$effect(() => {
		const id = selectedState;
		if (!cy) return;
		cy.elements().unselect();
		if (id !== null && nodeOf.has(id)) cy.getElementById(nodeOf.get(id) as string).select();
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		cy?.destroy();
	});

	export function fit(): void {
		if (!cy) return;
		const visible = cy.elements().filter((e) => e.visible());
		cy.fit(visible.length > 0 ? visible : undefined, 36);
		if (cy.zoom() > 1.6) {
			cy.zoom(1.6);
			cy.center(visible);
		}
	}

	export function relayout(): void {
		if (!cy) return;
		cy.layout(layoutOptions).run();
		fit();
	}

	function zoomBy(factor: number): void {
		if (!cy) return;
		const z = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
		cy.zoom({ level: z, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
	}

	async function exportPng(): Promise<void> {
		if (!cy || !automaton) return;
		exportError = '';
		try {
			const blob = await cy.png({ output: 'blob-promise', full: true, scale: 2, bg: palette.card });
			downloadBlob(blob, exportFilename(regex, automaton.kind, 'png'));
		} catch (e) {
			exportError = `No se pudo exportar a PNG: ${e instanceof Error ? e.message : String(e)}`;
		}
	}

	function exportSvg(): void {
		if (!cy || !automaton) return;
		exportError = '';
		try {
			const svg = graphToSvg(cy, {
				font: "'IBM Plex Mono', Consolas, monospace",
				background: palette.card,
				title: `${AUTOMATON_NAMES[automaton.kind]} de ${regex}`
			});
			downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), exportFilename(regex, automaton.kind, 'svg'));
		} catch (e) {
			exportError = `No se pudo exportar a SVG: ${e instanceof Error ? e.message : String(e)}`;
		}
	}

	const description = $derived(
		automaton
			? `Diagrama del ${AUTOMATON_NAMES[automaton.kind]} con ${automaton.states.length} estados y ${automaton.transitions.length} transiciones. Estado inicial ${automaton.start}; estados de aceptación ${automaton.accepting.join(', ') || 'ninguno'}. La tabla de transiciones del panel de información contiene los mismos datos en formato accesible.`
			: 'Sin autómata generado.'
	);
</script>

<div class="graph">
	<div class="toolbar" role="toolbar" aria-label="Controles del diagrama">
		<button type="button" class="btn btn-sm btn-icon" onclick={() => zoomBy(1.25)} disabled={!automaton} title="Acercar">
			<Icon name="zoom-in" /><span class="sr-only">Acercar</span>
		</button>
		<button type="button" class="btn btn-sm btn-icon" onclick={() => zoomBy(0.8)} disabled={!automaton} title="Alejar">
			<Icon name="zoom-out" /><span class="sr-only">Alejar</span>
		</button>
		<button type="button" class="btn btn-sm" onclick={fit} disabled={!automaton} title="Centrar y ajustar al área disponible">
			<Icon name="fit" />Ajustar
		</button>
		<button type="button" class="btn btn-sm" onclick={relayout} disabled={!automaton} title="Recalcular la distribución automática de los estados">
			<Icon name="layout" />Redistribuir
		</button>
		<span class="spacer"></span>
		<button type="button" class="btn btn-sm" onclick={exportSvg} disabled={!automaton} title="Descargar el diagrama como SVG vectorial">
			<Icon name="download" />SVG
		</button>
		<button type="button" class="btn btn-sm" onclick={exportPng} disabled={!automaton} title="Descargar el diagrama como imagen PNG">
			<Icon name="download" />PNG
		</button>
	</div>
	{#if exportError}
		<p class="alert alert-error export-error" role="alert"><Icon name="alert" /><span>{exportError}</span></p>
	{/if}
	<div class="canvas" bind:this={container} role="img" aria-label={description}></div>
	<ul class="legend" aria-label="Leyenda">
		<li><svg width="30" height="14" aria-hidden="true"><line x1="2" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="2" /><path d="M20 3l8 4-8 4z" fill="currentColor" /></svg>inicial</li>
		<li><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="9" cy="9" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>aceptación</li>
		<li><svg width="30" height="14" aria-hidden="true"><line x1="2" y1="7" x2="28" y2="7" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4" /></svg>ε</li>
		<li><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2.5" /></svg>sumidero</li>
	</ul>
</div>

<style>
	.graph {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		padding: var(--sp-2);
		border-bottom: var(--border);
		background: var(--surface);
		border-radius: var(--radius) var(--radius) 0 0;
	}

	.spacer {
		flex: 1;
	}

	.canvas {
		flex: 1;
		min-height: 0;
		background-color: var(--card);
		background-image: radial-gradient(var(--grid) 1.2px, transparent 1.2px);
		background-size: 22px 22px;
		border-radius: 0 0 var(--radius) var(--radius);
	}

	.canvas:focus-visible {
		box-shadow: inset 0 0 0 3px var(--blue);
	}

	.legend {
		position: absolute;
		left: var(--sp-2);
		bottom: var(--sp-2);
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin: 0;
		padding: 4px var(--sp-2);
		list-style: none;
		font-family: var(--mono);
		font-size: var(--fs-xs);
		color: var(--navy);
		background: rgba(255, 255, 255, 0.9);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		pointer-events: none;
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.export-error {
		margin: var(--sp-2);
	}
</style>
