import type { RegexNode } from '../src/lib/regex/ast';
import { AutomatonIndex, completeDfa } from '../src/lib/automata/core';
import type { Automaton } from '../src/lib/automata/types';

/**
 * Oráculo independiente: traduce el AST a una expresión regular de
 * JavaScript. Solo se usa en las pruebas para contrastar los autómatas.
 */
export function toJsRegExp(node: RegexNode): RegExp {
	const go = (n: RegexNode): string => {
		switch (n.kind) {
			case 'symbol':
				return n.value;
			case 'epsilon':
				return '(?:)';
			case 'empty':
				return '(?!)';
			case 'union':
				return `(?:${go(n.left)}|${go(n.right)})`;
			case 'concat':
				return `(?:${go(n.left)}${go(n.right)})`;
			case 'star':
				return `(?:${go(n.child)})*`;
		}
	};
	return new RegExp(`^(?:${go(node)})$`);
}

/** Todas las cadenas sobre `alphabet` de longitud ≤ `maxLength`. */
export function allWords(alphabet: string[], maxLength: number): string[] {
	const out = [''];
	let frontier = [''];
	for (let i = 0; i < maxLength; i++) {
		frontier = frontier.flatMap((w) => alphabet.map((c) => w + c));
		out.push(...frontier);
	}
	return out;
}

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Expresión aleatoria en texto, usando toda la sintaxis permitida. */
export function randomRegex(random: () => number, depth: number, symbols = ['a', 'b']): string {
	const pick = <T>(xs: T[]): T => xs[Math.floor(random() * xs.length)] as T;
	if (depth <= 0 || random() < 0.25) {
		const r = random();
		if (r < 0.08) return 'ε';
		if (r < 0.12) return '∅';
		return pick(symbols);
	}
	const op = random();
	if (op < 0.35) return `${randomRegex(random, depth - 1, symbols)}+${randomRegex(random, depth - 1, symbols)}`;
	if (op < 0.75) return `(${randomRegex(random, depth - 1, symbols)})(${randomRegex(random, depth - 1, symbols)})`;
	return `(${randomRegex(random, depth - 1, symbols)})*`;
}

/**
 * Comprobación independiente de minimalidad (algoritmo de llenado de tabla):
 * devuelve los pares de estados equivalentes del AFD completo. En un AFD
 * mínimo no debe haber ninguno.
 */
export function equivalentPairs(dfa: Automaton): [string, string][] {
	const { automaton } = completeDfa(dfa);
	const index = new AutomatonIndex(automaton);
	// Solo se comparan los estados originales: el sumidero agregado representa
	// las transiciones ausentes de un AFD parcial.
	const ids = dfa.states.map((s) => s.id);
	const all = automaton.states.map((s) => s.id);
	const key = (p: string, q: string): string => (p < q ? `${p}|${q}` : `${q}|${p}`);
	const marked = new Set<string>();
	for (const p of all) for (const q of all) if (p < q && index.isAccepting(p) !== index.isAccepting(q)) marked.add(key(p, q));
	let changed = true;
	while (changed) {
		changed = false;
		for (const p of all)
			for (const q of all) {
				if (p >= q || marked.has(key(p, q))) continue;
				for (const c of automaton.alphabet) {
					const tp = index.targets(p, c)[0] as string;
					const tq = index.targets(q, c)[0] as string;
					if (tp !== tq && marked.has(key(tp, tq))) {
						marked.add(key(p, q));
						changed = true;
						break;
					}
				}
			}
	}
	const pairs: [string, string][] = [];
	for (const p of ids) for (const q of ids) if (p < q && !marked.has(key(p, q))) pairs.push([p, q]);
	return pairs;
}
