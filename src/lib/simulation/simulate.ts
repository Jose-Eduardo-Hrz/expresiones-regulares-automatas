import { AutomatonIndex, epsilonClosureDetailed, formatSet, moveDetailed } from '#lib/automata/core.ts';
import type { Automaton } from '#lib/automata/types.ts';

/** Longitud máxima de las cadenas que se simulan. */
export const MAX_INPUT_LENGTH = 200;

export interface SimulationStep {
	/** Cantidad de símbolos consumidos tras este paso. */
	consumed: number;
	/** Símbolo consumido en este paso (`null` en la configuración inicial). */
	symbol: string | null;
	/** Estados activos tras el paso (incluida la ε-cerradura). */
	active: string[];
	/** Transiciones con símbolo recorridas en el paso. */
	transitions: string[];
	/** Transiciones ε recorridas al calcular la cerradura. */
	epsilonTransitions: string[];
	explanation: string;
}

export interface SimulationResult {
	/** Cadena normalizada (sin espacios). */
	input: string;
	symbols: string[];
	accepted: boolean;
	steps: SimulationStep[];
	/** Explicación del veredicto. */
	verdict: string;
	/** Símbolo fuera del alfabeto que detuvo la simulación. */
	invalidSymbol?: { symbol: string; index: number };
}

/**
 * Normaliza la entrada: quita espacios y los símbolos ε (que representan la
 * cadena vacía y no consumen nada). Una entrada vacía es la cadena ε.
 */
export function normalizeInput(raw: string): string[] {
	return [...raw.replace(/[\sελ]/g, '')];
}

/**
 * Ejecuta el autómata sobre la cadena. Funciona para cualquier tipo de
 * autómata: mantiene el conjunto de estados activos y aplica la
 * ε-cerradura tras cada paso. En un AFD el conjunto tiene siempre a lo sumo
 * un estado, así que equivale a seguir la única transición aplicable.
 */
export function simulate(automaton: Automaton, raw: string): SimulationResult {
	const symbols = normalizeInput(raw).slice(0, MAX_INPUT_LENGTH);
	const input = symbols.join('');
	const index = new AutomatonIndex(automaton);
	const deterministic = automaton.kind === 'dfa' || automaton.kind === 'mindfa';
	const hasEpsilon = automaton.transitions.some((t) => t.symbol === null);
	const alphabet = new Set(automaton.alphabet);
	const steps: SimulationStep[] = [];
	const setText = (s: string[]): string => (deterministic && s.length === 1 ? (s[0] as string) : formatSet(s));

	const initial = epsilonClosureDetailed(index, [automaton.start]);
	steps.push({
		consumed: 0,
		symbol: null,
		active: initial.states,
		transitions: [],
		epsilonTransitions: initial.transitions,
		explanation: hasEpsilon
			? `Inicio: ε-cerradura(${automaton.start}) = ${formatSet(initial.states)}.`
			: `Inicio en el estado ${automaton.start}.`
	});

	let active = initial.states;
	for (let i = 0; i < symbols.length; i++) {
		const symbol = symbols[i] as string;
		if (!alphabet.has(symbol)) {
			return {
				input,
				symbols,
				accepted: false,
				steps,
				invalidSymbol: { symbol, index: i },
				verdict: `Rechazada: «${symbol}» (posición ${i + 1}) no pertenece al alfabeto ${formatSet(automaton.alphabet)}.`
			};
		}
		const moved = moveDetailed(index, active, symbol);
		const closure = epsilonClosureDetailed(index, moved.states);
		let explanation: string;
		if (deterministic) {
			explanation =
				moved.states.length > 0
					? `δ(${setText(active)}, ${symbol}) = ${setText(moved.states)}.`
					: `δ(${setText(active)}, ${symbol}) no está definida: no hay transición con «${symbol}».`;
		} else if (hasEpsilon) {
			explanation = `mover(${formatSet(active)}, ${symbol}) = ${formatSet(moved.states)}; ε-cerradura = ${formatSet(closure.states)}.`;
		} else {
			explanation = `δ(${formatSet(active)}, ${symbol}) = ${formatSet(moved.states)}.`;
		}
		steps.push({
			consumed: i + 1,
			symbol,
			active: closure.states,
			transitions: moved.transitions,
			epsilonTransitions: closure.transitions,
			explanation
		});
		active = closure.states;
		if (active.length === 0) {
			return {
				input,
				symbols,
				accepted: false,
				steps,
				verdict: `Rechazada: tras leer «${symbols.slice(0, i + 1).join('')}» no queda ningún estado activo, así que el resto de la cadena no puede procesarse.`
			};
		}
	}

	const finals = active.filter((s) => index.isAccepting(s));
	const shown = input.length > 0 ? `«${input}»` : 'La cadena vacía ε';
	return {
		input,
		symbols,
		accepted: finals.length > 0,
		steps,
		verdict:
			finals.length > 0
				? `Aceptada: ${shown} termina en ${deterministic ? `el estado de aceptación ${finals[0]}` : `un conjunto que contiene ${formatSet(finals)}, de aceptación`}.`
				: `Rechazada: ${shown} termina en ${setText(active)}, que no ${deterministic ? 'es' : 'contiene ningún estado'} de aceptación.`
	};
}

/** Versión rápida (sin traza) para pruebas y comparaciones. */
export function accepts(automaton: Automaton, input: string): boolean {
	return simulate(automaton, input).accepted;
}
