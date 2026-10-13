<script lang="ts">
	import { formatSet, transitionTable } from '#lib/automata/core.ts';
	import { AUTOMATON_NAMES, type Automaton, type State } from '#lib/automata/types.ts';

	interface Props {
		automaton: Automaton;
		/** Símbolo de cada posición (método directo), para describir los estados. */
		positionSymbols?: Map<number, string>;
		selected?: string | null;
		onselectstate?: (id: string) => void;
	}

	let { automaton, positionSymbols, selected = null, onselectstate }: Props = $props();

	const table = $derived(transitionTable(automaton));
	const byId = $derived(new Map(automaton.states.map((s) => [s.id, s])));
	const hasDetail = $derived(automaton.states.some((s) => detailText(s) !== ''));

	function detailText(s: State | undefined): string {
		const d = s?.detail;
		if (!d) return '';
		if (d.nfaStates) return formatSet(d.nfaStates);
		if (d.positions) return formatSet(d.positions.map((p) => (positionSymbols?.has(p) ? `${p}:${positionSymbols.get(p)}` : String(p))));
		if (d.mergedStates) return formatSet(d.mergedStates);
		if (d.sink) return 'sumidero';
		return '';
	}

	const detailHeader = $derived(
		automaton.states.some((s) => s.detail?.nfaStates)
			? 'Estados del AFN'
			: automaton.states.some((s) => s.detail?.positions)
				? 'Posiciones'
				: automaton.states.some((s) => s.detail?.mergedStates)
					? 'Estados fusionados'
					: 'Detalle'
	);
</script>

<div class="table-wrap">
	<table class="table">
		<caption class="sr-only">Tabla de transiciones del {AUTOMATON_NAMES[automaton.kind]}. → marca el estado inicial y * los de aceptación.</caption>
		<thead>
			<tr>
				<th scope="col">Estado</th>
				{#each table.symbols as c, i (i)}
					<th scope="col" class="mono">{c ?? 'ε'}</th>
				{/each}
				{#if hasDetail}<th scope="col">{detailHeader}</th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each table.rows as row (row.state)}
				<tr class:is-current={row.state === selected}>
					<th scope="row" class="mono state">
						<span class="marks" aria-hidden="true">{row.isStart ? '→' : ''}{row.isAccepting ? '*' : ''}</span>
						<button type="button" class="state-btn" onclick={() => onselectstate?.(row.state)} title="Seleccionar en el diagrama">
							{row.state}
						</button>
						{#if row.isStart}<span class="sr-only">(inicial)</span>{/if}
						{#if row.isAccepting}<span class="sr-only">(aceptación)</span>{/if}
					</th>
					{#each row.cells as cell, i (i)}
						<td class="mono">
							{#if cell.length === 0}
								<span class="muted">—</span>
							{:else if automaton.kind === 'dfa' || automaton.kind === 'mindfa'}
								{cell[0]}
							{:else}
								{formatSet(cell)}
							{/if}
						</td>
					{/each}
					{#if hasDetail}<td class="mono detail">{detailText(byId.get(row.state))}</td>{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="help legend">
	<span class="mono">→</span> estado inicial · <span class="mono">*</span> estado de aceptación · <span class="mono">—</span> sin transición
</p>

<style>
	.state {
		white-space: nowrap;
	}

	.marks {
		display: inline-block;
		min-width: 1.6em;
		color: var(--accent);
		font-weight: 700;
	}

	.state-btn {
		border: 0;
		background: none;
		padding: 0 2px;
		font: inherit;
		font-weight: 600;
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	.detail {
		color: var(--muted);
		font-size: var(--fs-xs);
	}

	.legend {
		margin-top: var(--sp-2);
		font-size: var(--fs-xs);
	}
</style>
