<script lang="ts">
	import { onDestroy } from 'svelte';
	import { AUTOMATON_NAMES, type Automaton } from '#lib/automata/types.ts';
	import { formatSet } from '#lib/automata/core.ts';
	import { sampleWords } from '#lib/algorithms/compare.ts';
	import { MAX_INPUT_LENGTH, simulate, type SimulationResult } from '#lib/simulation/simulate.ts';
	import type { GraphDecoration } from '#lib/visualization/graphModel.ts';
	import Icon from './Icon.svelte';

	interface Props {
		automaton: Automaton;
		ondecorate: (decoration: GraphDecoration | null) => void;
	}

	let { automaton, ondecorate }: Props = $props();

	let input = $state('');
	let result = $state<SimulationResult | null>(null);
	let position = $state(0);
	let playing = $state(false);
	let timer: ReturnType<typeof setInterval> | undefined;

	const quick = $derived(sampleWords(automaton.alphabet, 9).slice(0, 9));
	const step = $derived(result?.steps[position]);
	const atEnd = $derived(result !== null && position === result.steps.length - 1);

	function stop(): void {
		playing = false;
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	function show(i: number): void {
		if (!result) return;
		position = Math.max(0, Math.min(result.steps.length - 1, i));
		const s = result.steps[position];
		if (!s) return;
		ondecorate({
			highlight: { states: s.active, transitions: [...s.transitions, ...s.epsilonTransitions] },
			verdict: position === result.steps.length - 1 ? (result.accepted ? 'accepted' : 'rejected') : undefined
		});
	}

	function animate(): void {
		stop();
		if (!result) return;
		if (position >= result.steps.length - 1) show(0);
		playing = true;
		timer = setInterval(() => {
			if (!result || position >= result.steps.length - 1) stop();
			else show(position + 1);
		}, 900);
	}

	function run(word = input): void {
		input = word;
		result = simulate(automaton, word);
		show(0);
		animate();
	}

	function reset(): void {
		stop();
		result = null;
		position = 0;
		ondecorate(null);
	}

	// Una nueva conversión invalida la simulación anterior.
	$effect(() => {
		void automaton;
		return () => reset();
	});

	onDestroy(stop);

	function onsubmit(event: SubmitEvent): void {
		event.preventDefault();
		run();
	}

	const active = (states: string[]): string =>
		automaton.kind === 'dfa' || automaton.kind === 'mindfa' ? (states[0] ?? '∅') : formatSet(states);
</script>

<section class="sim" aria-label="Simulador de cadenas">
	<form class="controls" {onsubmit}>
		<label class="field grow">
			<span class="label">Cadena de entrada <span class="muted">(vacía = ε)</span></span>
			<input class="input input-mono" bind:value={input} maxlength={MAX_INPUT_LENGTH} autocomplete="off" spellcheck="false" placeholder="ε" />
		</label>
		<button type="submit" class="btn btn-primary"><Icon name="play" />Simular</button>
		<button type="button" class="btn" onclick={reset} disabled={!result}><Icon name="reset" />Reiniciar</button>
	</form>

	<div class="quick" aria-label="Pruebas rápidas">
		<span class="label">Pruebas rápidas</span>
		{#each quick as w (w)}
			<button type="button" class="chip" onclick={() => run(w)}>{w === '' ? 'ε' : w}</button>
		{/each}
	</div>

	{#if result}
		<div class="alert {result.accepted ? 'alert-ok' : 'alert-error'} verdict" role="status">
			<Icon name={result.accepted ? 'check' : 'x'} />
			<div>
				<p><strong>{result.accepted ? 'ACEPTADA' : 'RECHAZADA'}</strong> por el {AUTOMATON_NAMES[automaton.kind]}</p>
				<p>{result.verdict}</p>
			</div>
		</div>

		<div class="tape" aria-label="Cinta de entrada">
			{#if result.symbols.length === 0}
				<span class="cell current">ε</span>
			{:else}
				{#each result.symbols as c, i (i)}
					<span class="cell" class:read={i < (step?.consumed ?? 0)} class:current={i === (step?.consumed ?? 0) - 1} class:bad={result.invalidSymbol?.index === i}>{c}</span>
				{/each}
			{/if}
			<span class="tape-controls">
				<button type="button" class="btn btn-sm btn-icon" onclick={() => { stop(); show(position - 1); }} disabled={position === 0} title="Paso anterior">
					<Icon name="prev" /><span class="sr-only">Paso anterior</span>
				</button>
				<button type="button" class="btn btn-sm btn-icon" onclick={() => (playing ? stop() : animate())} title={playing ? 'Pausar' : 'Animar recorrido'}>
					<Icon name={playing ? 'pause' : 'play'} /><span class="sr-only">{playing ? 'Pausar' : 'Animar recorrido'}</span>
				</button>
				<button type="button" class="btn btn-sm btn-icon" onclick={() => { stop(); show(position + 1); }} disabled={atEnd} title="Paso siguiente">
					<Icon name="next" /><span class="sr-only">Paso siguiente</span>
				</button>
			</span>
		</div>

		<div class="table-wrap trace">
			<table class="table">
				<caption class="sr-only">Recorrido de la cadena por el autómata</caption>
				<thead>
					<tr><th scope="col">#</th><th scope="col">Leído</th><th scope="col">Estados activos</th><th scope="col">Explicación</th></tr>
				</thead>
				<tbody>
					{#each result.steps as s, i (i)}
						<tr class:is-current={i === position}>
							<td><button type="button" class="link-btn mono" onclick={() => { stop(); show(i); }} aria-label={`Ver paso ${i}`}>{i}</button></td>
							<td class="mono">{s.consumed === 0 ? 'ε' : result.symbols.slice(0, s.consumed).join('')}</td>
							<td class="mono">{active(s.active)}</td>
							<td>{s.explanation}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="help">
			La simulación usa el autómata que se muestra: en un AFD sigue la única transición aplicable; en un AFN mantiene todos los
			estados posibles{automaton.kind === 'enfa' ? ' y aplica las ε-cerraduras' : ''}.
		</p>
	{/if}
</section>

<style>
	.sim {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
	}

	.controls {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.grow {
		flex: 1;
		min-width: 180px;
	}

	.controls .btn {
		min-height: 40px;
	}

	.quick {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1);
	}

	.quick .label {
		margin-right: var(--sp-1);
	}

	.tape {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 3px;
	}

	.cell {
		display: inline-grid;
		place-items: center;
		min-width: 28px;
		height: 32px;
		padding: 0 4px;
		font-family: var(--mono);
		font-weight: 600;
		border: 1.5px solid var(--navy);
		border-radius: 4px;
		background: var(--card);
	}

	.cell.read {
		background: var(--accent-l);
		color: var(--accent-d);
	}

	.cell.current {
		border-width: 2.5px;
		border-color: var(--accent-d);
		box-shadow: var(--shadow-sm);
	}

	.cell.bad {
		background: var(--red-l);
		color: var(--red);
		border-color: var(--red);
	}

	.tape-controls {
		display: inline-flex;
		gap: var(--sp-1);
		margin-left: auto;
	}

	.trace {
		max-height: 220px;
	}

	.link-btn {
		border: 0;
		background: none;
		padding: 0 4px;
		color: var(--accent);
		text-decoration: underline;
		cursor: pointer;
		font-weight: 600;
	}
</style>
