<script lang="ts">
	import { AutomatonIndex, formatSet } from '#lib/automata/core.ts';
	import type { Automaton } from '#lib/automata/types.ts';
	import { edgeLabel } from '#lib/visualization/graphModel.ts';
	import type { GraphSelection } from './AutomatonGraph.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		automaton: Automaton;
		selection: GraphSelection;
		positionSymbols?: Map<number, string>;
		onclose: () => void;
	}

	let { automaton, selection, positionSymbols, onclose }: Props = $props();

	const index = $derived(new AutomatonIndex(automaton));
	const state = $derived(selection.type === 'state' ? automaton.states.find((s) => s.id === selection.id) : undefined);
	const outgoing = $derived(state ? index.allFrom(state.id) : []);
	const incoming = $derived(state ? automaton.transitions.filter((t) => t.to === state.id) : []);
</script>

<aside class="card" aria-label="Propiedades del elemento seleccionado">
	<div class="head">
		<span class="kicker">{selection.type === 'state' ? 'Estado' : 'Transición'}</span>
		<button type="button" class="btn btn-ghost btn-sm btn-icon" onclick={onclose} title="Cerrar">
			<Icon name="close" /><span class="sr-only">Cerrar propiedades</span>
		</button>
	</div>
	{#if selection.type === 'state' && state}
		<h2 class="name mono">{state.id}</h2>
		<div class="chips">
			{#if state.id === automaton.start}<span class="badge badge-start">inicial</span>{/if}
			{#if automaton.accepting.includes(state.id)}<span class="badge badge-final">aceptación</span>{/if}
			{#if state.detail?.sink}<span class="badge badge-sink">sumidero</span>{/if}
			{#if state.id !== automaton.start && !automaton.accepting.includes(state.id) && !state.detail?.sink}
				<span class="badge badge-sink">intermedio</span>
			{/if}
		</div>
		<dl class="deflist">
			{#if state.detail?.nfaStates}
				<dt>AFN</dt>
				<dd class="mono">{formatSet(state.detail.nfaStates)}</dd>
			{/if}
			{#if state.detail?.positions}
				<dt>Posiciones</dt>
				<dd class="mono">
					{formatSet(state.detail.positions.map((p) => (positionSymbols?.has(p) ? `${p}:${positionSymbols.get(p)}` : String(p))))}
				</dd>
			{/if}
			{#if state.detail?.mergedStates}
				<dt>Agrupa</dt>
				<dd class="mono">{formatSet(state.detail.mergedStates)}</dd>
			{/if}
			{#if state.detail?.note}
				<dt>Origen</dt>
				<dd>{state.detail.note}</dd>
			{/if}
			<dt>Salidas</dt>
			<dd class="mono">
				{#if outgoing.length === 0}<span class="muted">ninguna</span>{/if}
				{#each outgoing as t (t.id)}
					<div>—{t.symbol ?? 'ε'}→ {t.to}</div>
				{/each}
			</dd>
			<dt>Entradas</dt>
			<dd>{incoming.length} transición(es)</dd>
		</dl>
	{:else if selection.type === 'edge'}
		<h2 class="name mono">{selection.from} → {selection.to}</h2>
		<dl class="deflist">
			<dt>Origen</dt>
			<dd class="mono">{selection.from}</dd>
			<dt>Destino</dt>
			<dd class="mono">{selection.to}</dd>
			<dt>Símbolos</dt>
			<dd class="mono">{edgeLabel(selection.transitions)}</dd>
			<dt>Detalle</dt>
			<dd class="mono">
				{#each selection.transitions as t (t.id)}
					<div>δ({t.from}, {t.symbol ?? 'ε'}) ∋ {t.to}</div>
				{/each}
			</dd>
		</dl>
		{#if selection.transitions.some((t) => t.symbol === null)}
			<p class="help">Una transición ε cambia de estado sin consumir ningún símbolo de la entrada.</p>
		{/if}
	{:else}
		<p class="help">El elemento ya no existe en este autómata.</p>
	{/if}
</aside>

<style>
	.card {
		position: absolute;
		top: 56px;
		right: var(--sp-3);
		z-index: 5;
		width: min(290px, calc(100% - 24px));
		max-height: calc(100% - 110px);
		overflow: auto;
		background: var(--card);
		border: var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: var(--sp-2) var(--sp-3) var(--sp-3);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.name {
		font-family: var(--mono);
		font-size: var(--fs-lg);
		margin: 0 0 var(--sp-2);
		overflow-wrap: anywhere;
	}

	.chips {
		margin-bottom: var(--sp-2);
	}

	.help {
		margin-top: var(--sp-2);
		font-size: var(--fs-xs);
	}
</style>
