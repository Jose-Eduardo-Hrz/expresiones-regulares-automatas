<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { alphabetOf } from '#lib/regex/ast.ts';
	import { EXAMPLES } from '#lib/regex/examples.ts';
	import { MAX_REGEX_LENGTH, tryParseRegex } from '#lib/regex/parser.ts';
	import Icon from './Icon.svelte';

	interface Props {
		value: string;
		onsubmit: () => void;
		onclear: () => void;
	}

	let { value = $bindable(), onsubmit, onclear }: Props = $props();

	let input = $state<HTMLInputElement | undefined>();
	let exampleChoice = $state('');

	const outcome = $derived(value.trim() === '' ? null : tryParseRegex(value));
	const alphabet = $derived(outcome?.ok ? alphabetOf(outcome.ast) : []);
	const error = $derived(outcome && !outcome.ok ? outcome.error : null);
	const length = $derived(value.replace(/\s/g, '').length);

	const INSERTS = [
		{ text: 'ε', title: 'Cadena vacía (también: eps)' },
		{ text: '∅', title: 'Lenguaje vacío (también: empty)' },
		{ text: '+', title: 'Unión (también: |)' },
		{ text: '*', title: 'Cerradura de Kleene' },
		{ text: '(', title: 'Abrir grupo' },
		{ text: ')', title: 'Cerrar grupo' }
	];

	async function insert(text: string): Promise<void> {
		const el = input;
		const start = el?.selectionStart ?? value.length;
		const end = el?.selectionEnd ?? value.length;
		value = value.slice(0, start) + text + value.slice(end);
		await tick();
		el?.focus();
		el?.setSelectionRange(start + text.length, start + text.length);
	}

	function chooseExample(event: Event): void {
		const regex = (event.currentTarget as HTMLSelectElement).value;
		if (!regex) return;
		value = regex;
		exampleChoice = '';
		onsubmit();
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			onsubmit();
		}
	}

	function clear(): void {
		value = '';
		onclear();
		input?.focus();
	}
</script>

<div class="editor">
	<div class="field">
		<label class="label" for="regex-input">Expresión regular</label>
		<div class="input-row">
			<input
				id="regex-input"
				bind:this={input}
				bind:value
				{onkeydown}
				class="input input-mono"
				type="text"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="(a+b)*abb"
				aria-invalid={error ? 'true' : 'false'}
				aria-describedby={error ? 'regex-error' : 'regex-help'}
			/>
		</div>
		<div class="inserts" role="group" aria-label="Insertar símbolos especiales">
			{#each INSERTS as item (item.text)}
				<button type="button" class="chip" title={item.title} onclick={() => insert(item.text)}>
					{item.text}<span class="sr-only">: {item.title}</span>
				</button>
			{/each}
			<span class="count" class:over={length > MAX_REGEX_LENGTH}>{length}/{MAX_REGEX_LENGTH}</span>
		</div>
	</div>

	{#if error}
		<div class="alert alert-error" id="regex-error" role="alert">
			<Icon name="alert" />
			<div>
				<p><strong>{error.message}</strong></p>
				{#if value.length > 0 && error.length >= 0}
					<p class="source mono" aria-hidden="true">
						{value.slice(0, error.position)}<mark>{value.slice(error.position, error.position + Math.max(1, error.length)) || ' '}</mark>{value.slice(error.position + Math.max(1, error.length))}
					</p>
				{/if}
				<p>{error.hint}</p>
			</div>
		</div>
	{:else}
		<p class="help" id="regex-help">
			Pulsa <span class="kbd">Enter</span> para generar. Precedencia: <code>*</code> &gt; concatenación &gt; <code>+</code>.
		</p>
	{/if}

	<div class="alphabet" aria-live="polite">
		<span class="label">Alfabeto Σ</span>
		{#if alphabet.length > 0}
			<span class="chips">
				{#each alphabet as symbol (symbol)}
					<span class="chip chip-ac">{symbol}</span>
				{/each}
			</span>
		{:else}
			<span class="muted mono">{outcome?.ok ? '∅ (sin símbolos)' : '—'}</span>
		{/if}
	</div>

	<div class="row">
		<div class="field grow">
			<label class="label" for="examples">Ejemplos</label>
			<select id="examples" class="select" bind:value={exampleChoice} onchange={chooseExample}>
				<option value="">Elige un ejemplo…</option>
				{#each EXAMPLES as ex (ex.regex)}
					<option value={ex.regex}>{ex.regex} — {ex.title}</option>
				{/each}
			</select>
		</div>
		<button type="button" class="btn clear" onclick={clear} title="Borrar la expresión y reiniciar la visualización">
			<Icon name="trash" />Limpiar
		</button>
	</div>

	<details class="disclosure">
		<summary>Símbolos permitidos</summary>
		<div class="disclosure-body">
			<table class="table">
				<thead>
					<tr><th scope="col">Escribe</th><th scope="col">Significado</th></tr>
				</thead>
				<tbody>
					<tr><td class="mono">a–z A–Z 0–9</td><td>Símbolos del alfabeto (un carácter cada uno)</td></tr>
					<tr><td class="mono">ε · eps · λ</td><td>Cadena vacía</td></tr>
					<tr><td class="mono">∅ · empty</td><td>Lenguaje vacío (ninguna cadena)</td></tr>
					<tr><td class="mono">+ · |</td><td>Unión</td></tr>
					<tr><td class="mono">ab</td><td>Concatenación (implícita, sin operador)</td></tr>
					<tr><td class="mono">*</td><td>Cerradura de Kleene (posfija)</td></tr>
					<tr><td class="mono">( )</td><td>Agrupación</td></tr>
				</tbody>
			</table>
			<p class="help note">
				Los espacios se ignoran; sirven para separar símbolos que formarían una palabra reservada: <code>e p s</code> es la
				concatenación de e, p y s. Más detalles en la <a href={resolve('/ayuda')}>guía de sintaxis</a>.
			</p>
		</div>
	</details>
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.inserts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1);
		margin-top: var(--sp-1);
	}

	.inserts .chip {
		min-width: 30px;
		justify-content: center;
		font-size: var(--fs-md);
	}

	.count {
		margin-left: auto;
		font-family: var(--mono);
		font-size: var(--fs-xs);
		color: var(--muted);
	}

	.count.over {
		color: var(--red);
		font-weight: 600;
	}

	.source {
		margin: 4px 0;
		padding: 2px 6px;
		background: var(--card);
		border: 1px solid var(--red);
		border-radius: 4px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--ink);
	}

	mark {
		background: var(--red);
		color: #fff;
		border-radius: 2px;
		padding: 0 1px;
	}

	.alphabet {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.row {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-2);
	}

	.grow {
		flex: 1;
		min-width: 0;
	}

	.clear {
		min-height: 40px;
	}

	.note {
		margin-top: var(--sp-2);
	}
</style>
