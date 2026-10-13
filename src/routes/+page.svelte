<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { convert, type ConversionOptions, type ConversionResult, type DfaSource, type MethodId } from '#lib/algorithms/pipeline.ts';
	import { AutomatonLimitError, formatSet } from '#lib/automata/core.ts';
	import { AUTOMATON_NAMES, type Automaton, type AutomatonKind } from '#lib/automata/types.ts';
	import { tryParseRegex } from '#lib/regex/parser.ts';
	import type { GraphDecoration } from '#lib/visualization/graphModel.ts';
	import AutomatonGraph, { type GraphSelection } from '#lib/components/AutomatonGraph.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InfoPanel from '#lib/components/InfoPanel.svelte';
	import MethodPicker from '#lib/components/MethodPicker.svelte';
	import RegexEditor from '#lib/components/RegexEditor.svelte';
	import SelectionCard from '#lib/components/SelectionCard.svelte';
	import Simulator from '#lib/components/Simulator.svelte';
	import StepPlayer from '#lib/components/StepPlayer.svelte';
	import SyntaxTreeView from '#lib/components/SyntaxTreeView.svelte';

	type Mode = 'result' | 'steps' | 'simulation';

	// Configuración
	let regex = $state('(a+b)*abb');
	let method = $state<MethodId>('thompson');
	let target = $state<AutomatonKind>('enfa');
	let minimizationSource = $state<DfaSource>('subsets');
	let showSink = $state(false);
	let autoUpdate = $state(true);

	// Resultado (sin proxies profundos: los autómatas son datos inmutables)
	let result = $state.raw<ConversionResult | null>(null);
	let conversionError = $state('');
	let generating = $state(false);
	let lastKey = '';

	// Vista
	let mode = $state<Mode>('result');
	let stepIndex = $state(0);
	let minView = $state<'after' | 'before'>('after');
	let selection = $state.raw<GraphSelection | null>(null);
	let simDecoration = $state.raw<GraphDecoration | null>(null);
	let graph = $state<ReturnType<typeof AutomatonGraph> | undefined>();

	const options = $derived<ConversionOptions>({ method, target, minimizationSource, showSink });

	async function generate(force = false): Promise<void> {
		const parsed = tryParseRegex(regex);
		if (!parsed.ok) {
			if (force) document.getElementById('regex-input')?.focus();
			return;
		}
		const key = JSON.stringify([regex.replace(/\s/g, ''), options]);
		if (!force && key === lastKey) return;
		lastKey = key;
		generating = true;
		// Deja que se pinte el indicador de carga antes del cálculo.
		await tick();
		await new Promise((r) => setTimeout(r, 0));
		try {
			result = convert(parsed.ast, regex, options);
			conversionError = '';
		} catch (e) {
			result = null;
			conversionError =
				e instanceof AutomatonLimitError ? e.message : `Error inesperado durante la conversión: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			generating = false;
		}
		stepIndex = 0;
		selection = null;
		simDecoration = null;
		minView = 'after';
	}

	function clearAll(): void {
		result = null;
		conversionError = '';
		lastKey = '';
		mode = 'result';
		stepIndex = 0;
		selection = null;
		simDecoration = null;
	}

	// Cambiar el método, el tipo o las opciones actualiza la visualización.
	$effect(() => {
		void options;
		untrack(() => generate());
	});

	// Actualización al escribir (con retardo) si la expresión es válida.
	$effect(() => {
		const current = regex;
		if (!autoUpdate) return;
		const timer = setTimeout(() => {
			if (tryParseRegex(current).ok) untrack(() => generate());
		}, 500);
		return () => clearTimeout(timer);
	});

	const step = $derived(result && mode === 'steps' ? result.steps[stepIndex] : undefined);
	const treeStep = $derived(step?.view.kind === 'tree' ? step.view : undefined);

	const graphAutomaton = $derived.by((): Automaton | null => {
		if (!result) return null;
		if (step?.view.kind === 'automaton') return step.view.automaton;
		if (mode === 'result' && result.minimization && minView === 'before') return result.minimization.source;
		return result.automaton;
	});

	const decoration = $derived.by((): GraphDecoration => {
		if (step?.view.kind === 'automaton') {
			return {
				visibleStates: step.view.visibleStates,
				visibleTransitions: step.view.visibleTransitions,
				partition: step.view.partition,
				hideRoles: step.view.hideRoles,
				highlight: step.highlight
			};
		}
		if (mode === 'simulation' && simDecoration) return simDecoration;
		if (mode === 'result' && result?.minimization && minView === 'before') return { partition: result.minimization.partition };
		return {};
	});

	const positionSymbols = $derived(new Map(result?.tree.positions.map((p) => [p.position, p.symbol]) ?? []));

	function setMode(next: Mode): void {
		mode = next;
		simDecoration = null;
		selection = null;
	}

	function jumpToStep(i: number): void {
		mode = 'steps';
		stepIndex = i;
		selection = null;
	}

	function selectState(id: string): void {
		selection = { type: 'state', id };
	}

	// Al cambiar de autómata mostrado, la selección anterior deja de tener sentido.
	$effect(() => {
		void graphAutomaton;
		untrack(() => {
			if (selection?.type === 'state' && graphAutomaton && !graphAutomaton.states.some((s) => s.id === (selection as { id: string }).id)) {
				selection = null;
			}
		});
	});

	const MODES: { id: Mode; label: string }[] = [
		{ id: 'result', label: 'Resultado' },
		{ id: 'steps', label: 'Paso a paso' },
		{ id: 'simulation', label: 'Simular cadenas' }
	];
</script>

<svelte:head>
	<title>Autómatas · Expresiones regulares a autómatas finitos</title>
</svelte:head>

<div class="workspace">
	<aside class="col col-config" aria-label="Configuración">
		<section class="panel" aria-labelledby="h-expr">
			<div class="panel-head"><h2 class="kicker" id="h-expr">1 · Expresión regular</h2></div>
			<div class="panel-body">
				<RegexEditor bind:value={regex} onsubmit={() => generate(true)} onclear={clearAll} />
			</div>
		</section>

		<section class="panel" aria-labelledby="h-conv">
			<div class="panel-head"><h2 class="kicker" id="h-conv">2 · Conversión</h2></div>
			<div class="panel-body">
				<MethodPicker bind:method bind:target bind:minimizationSource bind:showSink />
				<div class="generate">
					<button type="button" class="btn btn-primary btn-block" onclick={() => generate(true)} disabled={generating}>
						<Icon name="bolt" />{generating ? 'Generando…' : 'Generar autómata'}
					</button>
					<label class="check">
						<input type="checkbox" bind:checked={autoUpdate} />
						<span>Actualizar al escribir</span>
					</label>
				</div>
			</div>
		</section>
	</aside>

	<main class="col col-main" id="contenido">
		<section class="panel viewer" aria-labelledby="h-viewer">
			<div class="panel-head viewer-head">
				<h2 id="h-viewer" class="viewer-title">
					{#if result && graphAutomaton}
						<span class="kind">{treeStep ? 'Árbol aumentado' : AUTOMATON_NAMES[graphAutomaton.kind]}</span>
						<span class="mono expr">{result.regexText}</span>
					{:else}
						<span class="kind">Visualización</span>
					{/if}
				</h2>
				{#if result}
					{#if mode === 'result' && result.minimization}
						<div class="seg" role="group" aria-label="Comparar antes y después de minimizar">
							<button type="button" aria-pressed={minView === 'before'} onclick={() => (minView = 'before')}>Antes</button>
							<button type="button" aria-pressed={minView === 'after'} onclick={() => (minView = 'after')}>Después</button>
						</div>
					{/if}
					<div class="seg modes" role="group" aria-label="Modo de visualización">
						{#each MODES as m (m.id)}
							<button type="button" aria-pressed={mode === m.id} onclick={() => setMode(m.id)}>{m.label}</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="viewer-body">
				<div class="graph-wrap" class:hidden={!!treeStep || !result}>
					<AutomatonGraph
						bind:this={graph}
						automaton={graphAutomaton}
						{decoration}
						regex={result?.regexText ?? ''}
						selectedState={selection?.type === 'state' ? selection.id : null}
						onselect={(s) => (selection = s)}
					/>
				</div>

				{#if treeStep && result}
					<div class="tree-step">
						<SyntaxTreeView
							nodes={treeStep.tree.nodes}
							annotated
							fill
							computed={treeStep.computed}
							highlight={treeStep.highlight}
							title={`Árbol aumentado de (${result.regexText})#`}
						/>
						{#if treeStep.follow}
							<div class="table-wrap follow">
								<table class="table">
									<caption class="sr-only">Tabla followpos en este paso</caption>
									<thead><tr><th scope="col">i</th><th scope="col">símbolo</th><th scope="col">followpos(i)</th></tr></thead>
									<tbody>
										{#each treeStep.tree.positions as p (p.position)}
											<tr class:is-current={treeStep.followHighlight?.includes(p.position)}>
												<td class="mono">{p.position}</td>
												<td class="mono">{p.symbol}</td>
												<td class="mono">{formatSet(treeStep.follow[p.position - 1] ?? [])}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				{/if}

				{#if !result && !generating}
					<div class="empty-state overlay">
						{#if conversionError}
							<div class="alert alert-error" role="alert">
								<Icon name="alert" />
								<div>
									<p><strong>No se pudo construir el autómata</strong></p>
									<p>{conversionError}</p>
								</div>
							</div>
						{:else}
							<h2>Escribe una expresión regular</h2>
							<p>Elige un método y un tipo de autómata y pulsa <strong>Generar autómata</strong>, o selecciona uno de los ejemplos.</p>
						{/if}
					</div>
				{/if}

				{#if generating}
					<div class="loading" role="status" aria-live="polite">Generando el autómata…</div>
				{/if}

				{#if selection && graphAutomaton && !treeStep}
					<SelectionCard automaton={graphAutomaton} {selection} {positionSymbols} onclose={() => (selection = null)} />
				{/if}
			</div>
		</section>

		{#if result}
			<section class="panel dock" aria-label="Panel inferior">
				{#if mode === 'steps'}
					<StepPlayer steps={result.steps} stages={result.stages} bind:index={stepIndex} />
				{:else if mode === 'simulation'}
					<Simulator automaton={result.automaton} ondecorate={(d) => (simDecoration = d)} />
				{:else}
					<div class="result-bar">
						<p>
							<strong>{AUTOMATON_NAMES[result.automaton.kind]}</strong> con
							<strong>{result.automaton.states.length}</strong> estados y
							<strong>{result.automaton.transitions.length}</strong> transiciones, obtenido en {result.stages.length}
							{result.stages.length === 1 ? 'etapa' : 'etapas'}: {result.stages.map((s) => s.name).join(' → ')}.
						</p>
						{#each result.notes as note, i (i)}
							<p class="alert alert-info"><Icon name="info" /><span>{note}</span></p>
						{/each}
						<div class="btn-row">
							<button type="button" class="btn btn-sm" onclick={() => setMode('steps')}><Icon name="play" />Ver paso a paso</button>
							<button type="button" class="btn btn-sm" onclick={() => setMode('simulation')}><Icon name="check" />Probar cadenas</button>
							<button type="button" class="btn btn-sm" onclick={() => graph?.fit()}><Icon name="fit" />Ajustar diagrama</button>
						</div>
					</div>
				{/if}
			</section>
		{/if}
	</main>

	<div class="col col-info">
		{#if result && graphAutomaton}
			<InfoPanel
				{result}
				displayed={graphAutomaton}
				{stepIndex}
				stepMode={mode === 'steps'}
				selectedState={selection?.type === 'state' ? selection.id : null}
				{positionSymbols}
				onjumpstep={jumpToStep}
				onselectstate={selectState}
			/>
		{:else}
			<section class="panel">
				<div class="panel-head"><h2 class="kicker">Información</h2></div>
				<div class="panel-body">
					<p class="help">Aquí aparecerán la descripción del algoritmo, la tabla de transiciones, los pasos, el árbol sintáctico y la comparación entre métodos.</p>
				</div>
			</section>
		{/if}
	</div>
</div>

<style>
	.generate {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}

	.generate .btn {
		min-height: 44px;
		font-size: var(--fs-md);
	}

	.viewer {
		display: flex;
		flex-direction: column;
	}

	.viewer-head {
		flex-wrap: wrap;
		gap: var(--sp-2) var(--sp-3);
	}

	.viewer-title {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		flex: 1;
		min-width: 0;
		font-size: var(--fs-lg);
	}

	.expr {
		font-family: var(--mono);
		font-size: var(--fs-md);
		color: var(--accent-d);
		background: var(--accent-l);
		border-radius: 4px;
		padding: 0 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.viewer-body {
		position: relative;
		flex: 1;
		min-height: 0;
	}

	.graph-wrap {
		position: absolute;
		inset: 0;
	}

	.graph-wrap.hidden {
		visibility: hidden;
	}

	.tree-step {
		position: absolute;
		inset: 0;
		display: flex;
		gap: var(--sp-3);
		padding: var(--sp-3);
		background: var(--card);
		border-radius: 0 0 var(--radius) var(--radius);
	}

	.tree-step > :first-child {
		flex: 1;
		min-width: 0;
	}

	.follow {
		flex: 0 0 auto;
		align-self: flex-start;
		max-height: 100%;
	}

	.overlay {
		position: absolute;
		inset: 0;
		background: var(--card);
		border-radius: 0 0 var(--radius) var(--radius);
	}

	.overlay p {
		max-width: 46ch;
	}

	.loading {
		position: absolute;
		top: 64px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 6;
		font-family: var(--mono);
		font-size: var(--fs-sm);
		font-weight: 600;
		background: var(--amber-l);
		color: #7a4f00;
		border: 1.5px solid var(--amber);
		border-radius: var(--radius-sm);
		padding: 4px var(--sp-3);
	}

	.result-bar {
		padding: var(--sp-3) var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.result-bar p {
		margin: 0;
	}

	@media (max-width: 820px) {
		.tree-step {
			flex-direction: column;
			overflow: auto;
		}

		.modes {
			width: 100%;
		}

		.modes button {
			flex: 1;
			justify-content: center;
		}
	}
</style>
