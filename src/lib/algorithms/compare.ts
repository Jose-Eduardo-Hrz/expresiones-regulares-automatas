import type { RegexNode } from '#lib/regex/ast.ts';
import { alphabetOf } from '#lib/regex/ast.ts';
import { automatonStats, type AutomatonStats } from '#lib/automata/core.ts';
import type { Automaton, AutomatonKind } from '#lib/automata/types.ts';
import { accepts } from '#lib/simulation/simulate.ts';
import { directConstruction } from './direct';
import { eliminateEpsilon } from './epsilonElimination';
import { checkEquivalence, type EquivalenceResult } from './equivalence';
import { minimizeDfa } from './minimize';
import { subsetConstruction } from './subsets';
import { thompson } from './thompson';

export interface ComparisonEntry {
	id: string;
	label: string;
	route: string;
	kind: AutomatonKind;
	automaton: Automaton;
	stats: AutomatonStats;
	/** Equivalencia formal con el AFN-ε de Thompson (referencia). */
	equivalence: EquivalenceResult;
}

export interface ComparisonResult {
	entries: ComparisonEntry[];
	/** Cadenas de prueba y si cada autómata (mismo orden que `entries`) las acepta. */
	samples: { word: string; results: boolean[] }[];
	allEquivalent: boolean;
	/** Los dos AFD mínimos tienen la misma cantidad de estados (unicidad del AFD mínimo). */
	minimalSizesMatch: boolean;
}

/** Todas las cadenas sobre el alfabeto, por longitud creciente, hasta `limit` cadenas. */
export function sampleWords(alphabet: string[], limit = 40, maxLength = 6): string[] {
	const words = [''];
	let frontier = [''];
	for (let len = 1; len <= maxLength && words.length < limit && alphabet.length > 0; len++) {
		const next: string[] = [];
		for (const w of frontier) for (const c of alphabet) next.push(w + c);
		for (const w of next) {
			if (words.length >= limit) break;
			words.push(w);
		}
		frontier = next;
	}
	return words;
}

/** Construye el autómata con cada método y los compara formalmente. */
export function compareMethods(ast: RegexNode, extraWords: string[] = []): ComparisonResult {
	const t = thompson(ast).automaton;
	const e = eliminateEpsilon(t).automaton;
	const s = subsetConstruction(t).automaton;
	const d = directConstruction(ast).automaton;
	const ms = minimizeDfa(s).automaton;
	const md = minimizeDfa(d).automaton;
	const list: Omit<ComparisonEntry, 'stats' | 'equivalence'>[] = [
		{ id: 'enfa', label: 'AFN-ε', route: 'Thompson', kind: 'enfa', automaton: t },
		{ id: 'nfa', label: 'AFN', route: 'Thompson → eliminación de ε', kind: 'nfa', automaton: e },
		{ id: 'dfa-subsets', label: 'AFD', route: 'Thompson → subconjuntos', kind: 'dfa', automaton: s },
		{ id: 'dfa-direct', label: 'AFD', route: 'Construcción directa', kind: 'dfa', automaton: d },
		{ id: 'min-subsets', label: 'AFD mínimo', route: 'Subconjuntos → Hopcroft', kind: 'mindfa', automaton: ms },
		{ id: 'min-direct', label: 'AFD mínimo', route: 'Directo → Hopcroft', kind: 'mindfa', automaton: md }
	];
	const entries: ComparisonEntry[] = list.map((entry) => ({
		...entry,
		stats: automatonStats(entry.automaton),
		equivalence: checkEquivalence(t, entry.automaton)
	}));
	const words = [...new Set([...sampleWords(alphabetOf(ast)), ...extraWords])];
	return {
		entries,
		samples: words.map((word) => ({ word, results: entries.map((en) => accepts(en.automaton, word)) })),
		allEquivalent: entries.every((en) => en.equivalence.equivalent),
		minimalSizesMatch: ms.states.length === md.states.length
	};
}
