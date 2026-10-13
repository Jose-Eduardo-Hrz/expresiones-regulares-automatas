import { AutomatonIndex, isDeterministic } from '#lib/automata/core.ts';
import type { Automaton } from '#lib/automata/types.ts';
import { subsetConstruction } from './subsets';

export interface EquivalenceResult {
	equivalent: boolean;
	/** Cadena más corta aceptada por exactamente uno de los dos autómatas. */
	counterexample?: string;
	/** Cuál de los dos acepta el contraejemplo. */
	acceptedBy?: 'first' | 'second';
}

/** Devuelve un AFD equivalente (determinizando si es necesario). */
export function toDfa(a: Automaton): Automaton {
	return isDeterministic(a) ? a : subsetConstruction(a).automaton;
}

/**
 * Decide formalmente si dos autómatas aceptan el mismo lenguaje.
 * Recorre en anchura el autómata producto de sus AFD (con un sumidero
 * implícito `null` para transiciones ausentes) buscando un par de estados
 * en el que uno acepta y el otro no. Si existe, la ruta hasta él es la
 * cadena más corta que los distingue.
 */
export function checkEquivalence(a: Automaton, b: Automaton): EquivalenceResult {
	const da = new AutomatonIndex(toDfa(a));
	const db = new AutomatonIndex(toDfa(b));
	const alphabet = [...new Set([...da.automaton.alphabet, ...db.automaton.alphabet])].sort();
	type Pair = [string | null, string | null];
	const key = ([x, y]: Pair): string => `${x ?? '\u0001'}\u0000${y ?? '\u0001'}`;
	const startPair: Pair = [da.automaton.start, db.automaton.start];
	const seen = new Set([key(startPair)]);
	const queue: { pair: Pair; word: string }[] = [{ pair: startPair, word: '' }];
	while (queue.length > 0) {
		const { pair, word } = queue.shift() as { pair: Pair; word: string };
		const [x, y] = pair;
		const accA = x !== null && da.isAccepting(x);
		const accB = y !== null && db.isAccepting(y);
		if (accA !== accB) return { equivalent: false, counterexample: word, acceptedBy: accA ? 'first' : 'second' };
		for (const c of alphabet) {
			const next: Pair = [x === null ? null : (da.targets(x, c)[0] ?? null), y === null ? null : (db.targets(y, c)[0] ?? null)];
			if (next[0] === null && next[1] === null) continue;
			const k = key(next);
			if (!seen.has(k)) {
				seen.add(k);
				queue.push({ pair: next, word: word + c });
			}
		}
	}
	return { equivalent: true };
}
