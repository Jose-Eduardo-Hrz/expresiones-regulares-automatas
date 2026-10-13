<script lang="ts">
	import { formatSet } from '#lib/automata/core.ts';
	import type { AugmentedTree } from '#lib/algorithms/direct.ts';
	import type { RegexNode } from '#lib/regex/ast.ts';
	import { astToTreeNodes } from '#lib/visualization/treeLayout.ts';
	import SyntaxTreeView from './SyntaxTreeView.svelte';

	interface Props {
		ast: RegexNode;
		tree: AugmentedTree;
		regexText: string;
		/** Mostrar de entrada el árbol aumentado (método directo). */
		preferAugmented: boolean;
	}

	let { ast, tree, regexText, preferAugmented }: Props = $props();

	let augmented = $state(false);
	$effect.pre(() => {
		augmented = preferAugmented;
	});

	const plainNodes = $derived(astToTreeNodes(ast));
</script>

<div class="seg" role="group" aria-label="Tipo de árbol">
	<button type="button" aria-pressed={!augmented} onclick={() => (augmented = false)}>Árbol sintáctico</button>
	<button type="button" aria-pressed={augmented} onclick={() => (augmented = true)}>Árbol aumentado (r)#</button>
</div>

{#if !augmented}
	<p class="help intro">
		Árbol de <span class="mono">{regexText}</span> según la precedencia <span class="mono">*</span> &gt; concatenación (·) &gt; unión (+).
	</p>
	<SyntaxTreeView nodes={plainNodes} title={`Árbol sintáctico de ${regexText}`} />
{:else}
	<p class="help intro">Árbol aumentado con nullable, firstpos y lastpos, usado por la construcción directa.</p>
	<SyntaxTreeView nodes={tree.nodes} annotated title={`Árbol aumentado de (${regexText})#`} />

	<h3 class="section-title sub">nullable, firstpos y lastpos</h3>
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr><th scope="col">Nodo</th><th scope="col">Subexpresión</th><th scope="col">nullable</th><th scope="col">firstpos</th><th scope="col">lastpos</th></tr>
			</thead>
			<tbody>
				{#each tree.nodes as n (n.id)}
					<tr>
						<td class="mono">{n.label}{n.position !== undefined ? ` (${n.position})` : ''}</td>
						<td class="mono">{n.text}</td>
						<td>{n.nullable ? 'verdadero' : 'falso'}</td>
						<td class="mono">{formatSet(n.firstpos)}</td>
						<td class="mono">{formatSet(n.lastpos)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h3 class="section-title sub">followpos</h3>
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr><th scope="col">Posición</th><th scope="col">Símbolo</th><th scope="col">followpos</th></tr>
			</thead>
			<tbody>
				{#each tree.positions as p (p.position)}
					<tr>
						<td class="mono">{p.position}</td>
						<td class="mono">{p.symbol}</td>
						<td class="mono">{formatSet(tree.followpos[p.position - 1] ?? [])}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.intro {
		margin: var(--sp-2) 0;
	}

	.sub {
		margin-top: var(--sp-4);
	}
</style>
