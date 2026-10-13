<script lang="ts">
	import { compareMethods, type ComparisonResult } from '#lib/algorithms/compare.ts';
	import { AutomatonLimitError } from '#lib/automata/core.ts';
	import { normalizeInput } from '#lib/simulation/simulate.ts';
	import type { RegexNode } from '#lib/regex/ast.ts';
	import Icon from './Icon.svelte';

	interface Props {
		ast: RegexNode;
		regexText: string;
	}

	let { ast, regexText }: Props = $props();

	let comparison = $state<ComparisonResult | null>(null);
	let error = $state('');
	let extra = $state('');
	let comparedFor: RegexNode | null = null;

	function run(): void {
		error = '';
		try {
			const words = extra
				.split(',')
				.map((w) => normalizeInput(w).join(''))
				.filter((w, i, all) => all.indexOf(w) === i);
			comparison = compareMethods(ast, extra.trim() === '' ? [] : words);
			comparedFor = ast;
		} catch (e) {
			comparison = null;
			error = e instanceof AutomatonLimitError ? e.message : `Error al comparar: ${String(e)}`;
		}
	}

	// Recalcula automáticamente cuando cambia la expresión.
	$effect(() => {
		if (ast !== comparedFor) run();
	});
</script>

<p class="help">
	Se construye el autómata de <span class="mono">{regexText}</span> con cada método y se comprueba formalmente que todos aceptan el mismo
	lenguaje que el AFN-ε de Thompson (búsqueda en el autómata producto de sus AFD). Si dos autómatas difieren, se muestra la cadena más corta
	que los distingue.
</p>

{#if error}
	<p class="alert alert-error" role="alert"><Icon name="alert" /><span>{error}</span></p>
{/if}

{#if comparison}
	<div class="alert {comparison.allEquivalent ? 'alert-ok' : 'alert-error'} summary" role="status">
		<Icon name={comparison.allEquivalent ? 'check' : 'x'} />
		<div>
			<p>
				<strong>{comparison.allEquivalent ? 'Todos los métodos son equivalentes.' : 'Hay autómatas que no son equivalentes.'}</strong>
			</p>
			<p>
				{comparison.minimalSizesMatch
					? 'Los dos AFD mínimos tienen la misma cantidad de estados, como garantiza la unicidad del AFD mínimo.'
					: 'Los AFD mínimos tienen distinta cantidad de estados: revisa la minimización.'}
			</p>
		</div>
	</div>

	<div class="table-wrap">
		<table class="table">
			<caption class="sr-only">Comparación de los autómatas obtenidos con cada método</caption>
			<thead>
				<tr>
					<th scope="col">Autómata</th>
					<th scope="col">Construcción</th>
					<th scope="col">Estados</th>
					<th scope="col">Trans.</th>
					<th scope="col">ε</th>
					<th scope="col">¿Equivalente?</th>
				</tr>
			</thead>
			<tbody>
				{#each comparison.entries as e (e.id)}
					<tr>
						<th scope="row">{e.label}</th>
						<td>{e.route}</td>
						<td class="mono">{e.stats.states}</td>
						<td class="mono">{e.stats.transitions}</td>
						<td class="mono">{e.stats.epsilonTransitions}</td>
						<td>
							{#if e.equivalence.equivalent}
								<span class="ok"><Icon name="check" size={14} /> sí</span>
							{:else}
								<span class="bad"><Icon name="x" size={14} /> no: «{e.equivalence.counterexample || 'ε'}»</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<form
		class="extra"
		onsubmit={(e) => {
			e.preventDefault();
			run();
		}}
	>
		<label class="field grow">
			<span class="label">Cadenas adicionales (separadas por comas)</span>
			<input class="input mono" bind:value={extra} placeholder="abb, babb, ε" />
		</label>
		<button class="btn" type="submit">Probar</button>
	</form>

	<div class="table-wrap samples">
		<table class="table">
			<caption class="sr-only">Aceptación de cadenas de prueba por cada autómata</caption>
			<thead>
				<tr>
					<th scope="col">Cadena</th>
					{#each comparison.entries as e (e.id)}
						<th scope="col" title={e.route}>{e.label}<br /><span class="route">{e.route.split(' ')[0]}</span></th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each comparison.samples as s (s.word)}
					<tr>
						<th scope="row" class="mono">{s.word === '' ? 'ε' : s.word}</th>
						{#each s.results as r, i (i)}
							<td class:ok={r} class:bad={!r}>{r ? '✓ acepta' : '✗ rechaza'}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.summary {
		margin: var(--sp-3) 0;
	}

	.ok {
		color: var(--green);
		font-weight: 600;
		white-space: nowrap;
	}

	.bad {
		color: var(--red);
		font-weight: 600;
	}

	.extra {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-2);
		margin: var(--sp-3) 0;
	}

	.grow {
		flex: 1;
		min-width: 0;
	}

	.extra .btn {
		min-height: 40px;
	}

	.samples {
		max-height: 360px;
	}

	.samples td {
		font-size: var(--fs-xs);
		white-space: nowrap;
	}

	.route {
		font-weight: 400;
		opacity: 0.8;
	}
</style>
