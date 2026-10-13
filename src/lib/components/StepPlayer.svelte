<script lang="ts">
	import { onDestroy } from 'svelte';
	import { STAGE_NAMES, type AlgorithmStep } from '#lib/algorithms/steps.ts';
	import type { StageSummary } from '#lib/algorithms/pipeline.ts';
	import Icon from './Icon.svelte';

	interface Props {
		steps: AlgorithmStep[];
		stages: StageSummary[];
		index: number;
	}

	let { steps, stages, index = $bindable() }: Props = $props();

	let playing = $state(false);
	let speed = $state(1400);
	let timer: ReturnType<typeof setInterval> | undefined;

	const step = $derived(steps[index]);
	const stage = $derived(step ? stages.find((s) => s.id === step.stage) : undefined);
	const stageIndex = $derived(stage ? stages.indexOf(stage) : -1);

	function go(i: number): void {
		index = Math.max(0, Math.min(steps.length - 1, i));
	}

	function stop(): void {
		playing = false;
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	function play(): void {
		if (index >= steps.length - 1) go(0);
		playing = true;
		timer = setInterval(() => {
			if (index >= steps.length - 1) stop();
			else go(index + 1);
		}, speed);
	}

	function toggle(): void {
		if (playing) stop();
		else play();
	}

	function restart(): void {
		stop();
		go(0);
	}

	function changeSpeed(): void {
		if (playing) {
			stop();
			play();
		}
	}

	// Al cambiar el conjunto de pasos (nueva conversión) se detiene la reproducción.
	$effect(() => {
		void steps;
		return () => stop();
	});

	onDestroy(stop);

	function onkeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement;
		if (target.tagName === 'SELECT' || target.tagName === 'INPUT') return;
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			stop();
			go(index + 1);
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			stop();
			go(index - 1);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="player" aria-label="Modo paso a paso" {onkeydown}>
	<div class="controls" role="toolbar" aria-label="Controles de la ejecución paso a paso">
		<button type="button" class="btn btn-sm btn-icon" onclick={restart} title="Reiniciar (primer paso)">
			<Icon name="reset" /><span class="sr-only">Reiniciar</span>
		</button>
		<button type="button" class="btn btn-sm btn-icon" onclick={() => { stop(); go(index - 1); }} disabled={index === 0} title="Paso anterior (←)">
			<Icon name="prev" /><span class="sr-only">Paso anterior</span>
		</button>
		<button type="button" class="btn btn-sm btn-primary play" onclick={toggle} title={playing ? 'Pausar' : 'Ejecutar todos los pasos automáticamente'}>
			<Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pausar' : 'Reproducir'}
		</button>
		<button type="button" class="btn btn-sm btn-icon" onclick={() => { stop(); go(index + 1); }} disabled={index >= steps.length - 1} title="Paso siguiente (→)">
			<Icon name="next" /><span class="sr-only">Paso siguiente</span>
		</button>
		<button type="button" class="btn btn-sm btn-icon" onclick={() => { stop(); go(steps.length - 1); }} disabled={index >= steps.length - 1} title="Último paso">
			<Icon name="last" /><span class="sr-only">Último paso</span>
		</button>
		<label class="range">
			<span class="sr-only">Ir al paso</span>
			<input type="range" min="0" max={Math.max(0, steps.length - 1)} value={index} oninput={(e) => { stop(); go(Number((e.currentTarget as HTMLInputElement).value)); }} />
		</label>
		<span class="counter mono" aria-live="polite">Paso {index + 1} de {steps.length}</span>
		<label class="speed">
			<span class="sr-only">Velocidad</span>
			<select class="select" bind:value={speed} onchange={changeSpeed}>
				<option value={2400}>Lento</option>
				<option value={1400}>Normal</option>
				<option value={700}>Rápido</option>
			</select>
		</label>
	</div>

	{#if step}
		<div class="body" aria-live="polite">
			<p class="kicker">
				Etapa {stageIndex + 1}/{stages.length} · {STAGE_NAMES[step.stage]}
				{#if stage?.extra}<span class="badge badge-extra">paso adicional</span>{/if}
			</p>
			<h2 class="title">{step.title}</h2>
			<p class="desc">{step.description}</p>
			{#if step.details && step.details.length > 0}
				<ul class="details mono">
					{#each step.details as line, i (i)}
						<li>{line}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	.player {
		display: flex;
		flex-direction: column;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-2);
		border-bottom: var(--border);
		background: var(--surface);
		border-radius: var(--radius) var(--radius) 0 0;
	}

	.play {
		min-width: 118px;
	}

	.range {
		flex: 1;
		min-width: 120px;
		display: flex;
		padding: 0 var(--sp-2);
	}

	.range input {
		width: 100%;
		accent-color: var(--accent);
	}

	.counter {
		font-size: var(--fs-xs);
		font-weight: 600;
		white-space: nowrap;
	}

	.speed .select {
		min-height: 30px;
		padding: 2px var(--sp-2);
		font-size: var(--fs-xs);
	}

	.body {
		padding: var(--sp-3) var(--sp-4);
	}

	.title {
		font-size: var(--fs-lg);
		margin: 2px 0 var(--sp-1);
	}

	.desc {
		margin: 0 0 var(--sp-2);
	}

	.details {
		margin: 0;
		padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-5);
		font-size: var(--fs-sm);
		background: var(--surface);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
	}

	.details li + li {
		margin-top: 2px;
	}

	.kicker .badge {
		margin-left: var(--sp-2);
		letter-spacing: 0.04em;
	}
</style>
