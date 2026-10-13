<script lang="ts">
	import { METHODS, targetAvailability, type DfaSource, type MethodId } from '#lib/algorithms/pipeline.ts';
	import { AUTOMATON_LONG_NAMES, AUTOMATON_NAMES, type AutomatonKind } from '#lib/automata/types.ts';

	interface Props {
		method: MethodId;
		target: AutomatonKind;
		minimizationSource: DfaSource;
		showSink: boolean;
	}

	let {
		method = $bindable(),
		target = $bindable(),
		minimizationSource = $bindable(),
		showSink = $bindable()
	}: Props = $props();

	const TARGETS: AutomatonKind[] = ['enfa', 'nfa', 'dfa', 'mindfa'];
	const availability = $derived(targetAvailability(method));
	const unavailableReason = $derived(TARGETS.map((k) => availability[k].reason).find(Boolean));
	const SHORT: Record<AutomatonKind, string> = {
		enfa: 'con transiciones ε',
		nfa: 'sin transiciones ε',
		dfa: 'determinista',
		mindfa: 'determinista mínimo'
	};

	// Si el método no genera el tipo elegido, se pasa a uno compatible.
	$effect(() => {
		if (!availability[target].enabled) target = method === 'minimization' ? 'mindfa' : 'dfa';
	});
</script>

<fieldset class="choices">
	<legend class="label">Método de conversión</legend>
	{#each METHODS as m, i (m.id)}
		<label class="choice">
			<input type="radio" name="method" value={m.id} bind:group={method} />
			<span class="choice-title"><span class="num">{i + 1}</span> {m.name}</span>
			<span class="choice-desc">{m.summary}</span>
		</label>
	{/each}
</fieldset>

{#if method === 'minimization'}
	<div class="field source">
		<span class="label" id="min-source-label">AFD de partida</span>
		<div class="seg" role="group" aria-labelledby="min-source-label">
			<button type="button" aria-pressed={minimizationSource === 'subsets'} onclick={() => (minimizationSource = 'subsets')}>
				Thompson + subconjuntos
			</button>
			<button type="button" aria-pressed={minimizationSource === 'direct'} onclick={() => (minimizationSource = 'direct')}>
				Directo
			</button>
		</div>
	</div>
{/if}

<fieldset class="choices targets">
	<legend class="label">Tipo de autómata</legend>
	{#each TARGETS as kind (kind)}
		{@const a = availability[kind]}
		<label class="choice" title={a.reason ?? AUTOMATON_LONG_NAMES[kind]}>
			<input type="radio" name="target" value={kind} bind:group={target} disabled={!a.enabled} aria-describedby={a.enabled ? undefined : 'target-reason'} />
			<span class="choice-title">{AUTOMATON_NAMES[kind]}</span>
			<span class="choice-desc">{SHORT[kind]}</span>
		</label>
	{/each}
	{#if unavailableReason}
		<p class="help reason" id="target-reason">{unavailableReason}</p>
	{/if}
</fieldset>

<label class="check" class:disabled={target !== 'dfa' && target !== 'mindfa'}>
	<input type="checkbox" bind:checked={showSink} disabled={target !== 'dfa' && target !== 'mindfa'} />
	<span>
		Mostrar estado sumidero <span class="mono">∅</span> (AFD completo)
		<span class="help">Por convención, el sumidero se omite y las transiciones ausentes significan rechazo.</span>
	</span>
</label>

<style>
	.num {
		display: inline-grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--navy);
		color: #fff;
		font-family: var(--mono);
		font-size: var(--fs-xs);
		margin-right: 2px;
	}

	.source {
		margin-top: var(--sp-3);
	}

	.source .seg {
		align-self: flex-start;
		flex-wrap: wrap;
	}

	.targets {
		margin-top: var(--sp-4);
		grid-template-columns: 1fr 1fr;
	}

	.targets legend {
		grid-column: 1 / -1;
	}

	.reason {
		grid-column: 1 / -1;
		font-size: var(--fs-xs);
	}

	.check {
		margin-top: var(--sp-3);
	}

	.check .help {
		display: block;
		font-size: var(--fs-xs);
	}

	.check.disabled {
		color: var(--disabled);
		cursor: not-allowed;
	}

	@media (max-width: 380px) {
		.targets {
			grid-template-columns: 1fr;
		}
	}
</style>
