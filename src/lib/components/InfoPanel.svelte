<script lang="ts">
	import { METHODS, type ConversionResult } from '#lib/algorithms/pipeline.ts';
	import { STAGE_NAMES } from '#lib/algorithms/steps.ts';
	import { automatonStats, formatSet } from '#lib/automata/core.ts';
	import { AUTOMATON_LONG_NAMES, AUTOMATON_NAMES, type Automaton } from '#lib/automata/types.ts';
	import ComparePanel from './ComparePanel.svelte';
	import Icon from './Icon.svelte';
	import TransitionTableView from './TransitionTableView.svelte';
	import TreeDetails from './TreeDetails.svelte';

	interface Props {
		result: ConversionResult;
		/** Autómata que se muestra en el área principal. */
		displayed: Automaton;
		stepIndex: number;
		stepMode: boolean;
		selectedState: string | null;
		positionSymbols: Map<number, string>;
		onjumpstep: (index: number) => void;
		onselectstate: (id: string) => void;
	}

	let { result, displayed, stepIndex, stepMode, selectedState, positionSymbols, onjumpstep, onselectstate }: Props = $props();

	const TABS = [
		{ id: 'resumen', label: 'Resumen' },
		{ id: 'tabla', label: 'Tabla' },
		{ id: 'pasos', label: 'Pasos' },
		{ id: 'arbol', label: 'Árbol' },
		{ id: 'comparar', label: 'Comparar' }
	] as const;
	type TabId = (typeof TABS)[number]['id'];

	let tab = $state<TabId>('resumen');
	const tabButtons = $state<HTMLButtonElement[]>([]);

	const method = $derived(METHODS.find((m) => m.id === result.options.method));
	const stats = $derived(automatonStats(displayed));
	const usesDirect = $derived(result.stages.some((s) => s.id === 'direct'));

	function onTabKey(event: KeyboardEvent, i: number): void {
		let next = -1;
		if (event.key === 'ArrowRight') next = (i + 1) % TABS.length;
		else if (event.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = TABS.length - 1;
		if (next < 0) return;
		event.preventDefault();
		tab = TABS[next]?.id ?? tab;
		tabButtons[next]?.focus();
	}

	let stepList = $state<HTMLOListElement | undefined>();
	$effect(() => {
		if (tab !== 'pasos' || !stepList) return;
		const el = stepList.querySelector<HTMLElement>(`[data-step="${stepIndex}"]`);
		el?.scrollIntoView({ block: 'nearest' });
	});
</script>

<section class="panel info" aria-label="Información del autómata">
	<div class="tabs" role="tablist" aria-label="Secciones de información">
		{#each TABS as t, i (t.id)}
			<button
				bind:this={tabButtons[i]}
				type="button"
				role="tab"
				class="tab"
				id={`tab-${t.id}`}
				aria-selected={tab === t.id}
				aria-controls={`panel-${t.id}`}
				tabindex={tab === t.id ? 0 : -1}
				onclick={() => (tab = t.id)}
				onkeydown={(e) => onTabKey(e, i)}
			>
				{t.label}
			</button>
		{/each}
	</div>

	<div class="panel-scroll panel-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabindex="0">
		{#if tab === 'resumen'}
			<div class="section">
				<p class="kicker">Método {METHODS.findIndex((m) => m.id === result.options.method) + 1}</p>
				<h2>{method?.name}</h2>
				{#each method?.description ?? [] as paragraph, i (i)}
					<p class="text">{paragraph}</p>
				{/each}
			</div>

			<div class="section">
				<h3 class="section-title">Etapas ejecutadas</h3>
				<ol class="stages">
					{#each result.stages as s (s.id)}
						<li>
							<button type="button" class="stage-btn" onclick={() => onjumpstep(s.firstStep)} title="Ver los pasos de esta etapa">
								{s.name}
							</button>
							{#if s.extra}<span class="badge badge-extra">adicional</span>{/if}
							{#if s.automaton}
								<span class="muted mono small">→ {AUTOMATON_NAMES[s.automaton.kind]} · {s.automaton.states.length} estados</span>
							{/if}
						</li>
					{/each}
				</ol>
				{#each result.notes as note, i (i)}
					<p class="alert alert-info note"><Icon name="info" /><span>{note}</span></p>
				{/each}
			</div>

			<div class="section">
				<h3 class="section-title">{AUTOMATON_LONG_NAMES[displayed.kind]}</h3>
				<div class="stats">
					<div class="stat"><div class="stat-value">{stats.states}</div><div class="stat-label">estados</div></div>
					<div class="stat"><div class="stat-value">{stats.transitions}</div><div class="stat-label">transiciones</div></div>
					<div class="stat"><div class="stat-value">{stats.epsilonTransitions}</div><div class="stat-label">transiciones ε</div></div>
					<div class="stat"><div class="stat-value">{stats.accepting}</div><div class="stat-label">de aceptación</div></div>
				</div>
				<dl class="deflist facts">
					<dt>Expresión</dt>
					<dd class="mono">{result.regexText}</dd>
					<dt>Alfabeto</dt>
					<dd class="mono">Σ = {formatSet(displayed.alphabet)}</dd>
					<dt>Inicial</dt>
					<dd class="mono">{displayed.start}</dd>
					<dt>Aceptación</dt>
					<dd class="mono">F = {formatSet(displayed.accepting)}</dd>
					<dt>Determinista</dt>
					<dd>{stats.deterministic ? (stats.complete ? 'Sí (completo)' : 'Sí (parcial: faltan transiciones hacia el sumidero)') : 'No'}</dd>
				</dl>
			</div>

			{#if result.minimization}
				{@const m = result.minimization}
				<div class="section">
					<h3 class="section-title">Minimización</h3>
					<p class="text">
						{m.source.states.length} estados (incluido el sumidero, si hizo falta) → {result.automaton.states.length} estados.
						Partición final: <span class="mono">{m.partition.map((b) => formatSet(b)).join(' ')}</span>.
					</p>
					{#if m.merges.length === 0}
						<p class="text">No se fusionó ningún par de estados: todos eran distinguibles.</p>
					{/if}
					{#each m.merges as merge (merge.state)}
						<details class="disclosure merge" open>
							<summary>Se fusionan {formatSet(merge.members)} → {merge.state}</summary>
							<ul class="disclosure-body reasons">
								{#each merge.reasons as r, i (i)}<li>{r}</li>{/each}
							</ul>
						</details>
					{/each}
				</div>
			{/if}
		{:else if tab === 'tabla'}
			<p class="help caption">
				{AUTOMATON_LONG_NAMES[displayed.kind]}{stepMode ? ' (estado del paso actual)' : ''}. Pulsa un estado para seleccionarlo en el diagrama.
			</p>
			<TransitionTableView automaton={displayed} {positionSymbols} selected={selectedState} {onselectstate} />
		{:else if tab === 'pasos'}
			<ol class="steps" bind:this={stepList}>
				{#each result.steps as s, i (i)}
					{#if i === 0 || result.steps[i - 1]?.stage !== s.stage}
						<li class="stage-head" aria-hidden="true">{STAGE_NAMES[s.stage]}</li>
					{/if}
					<li data-step={i}>
						<button type="button" class="step-btn" class:current={stepMode && i === stepIndex} aria-current={stepMode && i === stepIndex ? 'step' : undefined} onclick={() => onjumpstep(i)}>
							<span class="n mono">{i + 1}</span>
							<span>{s.title}</span>
						</button>
					</li>
				{/each}
			</ol>
		{:else if tab === 'arbol'}
			<TreeDetails ast={result.ast} tree={result.tree} regexText={result.regexText} preferAugmented={usesDirect} />
		{:else if tab === 'comparar'}
			<ComparePanel ast={result.ast} regexText={result.regexText} />
		{/if}
	</div>
</section>

<style>
	.info {
		height: 100%;
	}

	.text {
		font-size: var(--fs-sm);
		margin: var(--sp-2) 0 0;
	}

	.stages {
		margin: 0 0 var(--sp-2);
		padding-left: var(--sp-5);
		font-size: var(--fs-sm);
	}

	.stages li + li {
		margin-top: var(--sp-1);
	}

	.stage-btn {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	.small {
		font-size: var(--fs-xs);
	}

	.note {
		margin-top: var(--sp-2);
	}

	.facts {
		margin-top: var(--sp-3);
	}

	.merge {
		margin-top: var(--sp-2);
	}

	.reasons {
		margin: 0;
		padding-left: var(--sp-5);
	}

	.caption {
		margin-bottom: var(--sp-2);
	}

	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.stage-head {
		font-family: var(--mono);
		font-size: var(--fs-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
		padding: var(--sp-3) 0 var(--sp-1);
		border-bottom: 1.5px dashed var(--line);
		margin-bottom: var(--sp-1);
	}

	.stage-head:first-child {
		padding-top: 0;
	}

	.step-btn {
		display: flex;
		gap: var(--sp-2);
		align-items: baseline;
		width: 100%;
		text-align: left;
		padding: 4px var(--sp-2);
		border: 1.5px solid transparent;
		border-radius: var(--radius-sm);
		background: none;
		font-size: var(--fs-sm);
		cursor: pointer;
	}

	.step-btn:hover {
		border-color: var(--line);
		background: var(--surface);
	}

	.step-btn.current {
		border-color: var(--accent-d);
		background: var(--accent-l);
		font-weight: 600;
	}

	.n {
		min-width: 2.2em;
		color: var(--muted);
		font-size: var(--fs-xs);
	}
</style>
