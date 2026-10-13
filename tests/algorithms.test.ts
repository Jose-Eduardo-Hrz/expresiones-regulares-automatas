import { describe, expect, it } from 'vitest';
import { parseRegex } from '../src/lib/regex/parser';
import { postOrder } from '../src/lib/regex/ast';
import { AutomatonIndex, AutomatonLimitError, deadStates, epsilonClosure, isComplete, isDeterministic } from '../src/lib/automata/core';
import type { Automaton } from '../src/lib/automata/types';
import { thompson } from '../src/lib/algorithms/thompson';
import { subsetConstruction } from '../src/lib/algorithms/subsets';
import { eliminateEpsilon } from '../src/lib/algorithms/epsilonElimination';
import { buildAugmentedTree, directConstruction } from '../src/lib/algorithms/direct';
import { minimizeDfa } from '../src/lib/algorithms/minimize';
import { checkEquivalence } from '../src/lib/algorithms/equivalence';
import { compareMethods } from '../src/lib/algorithms/compare';
import { convert, targetAvailability, type ConversionOptions } from '../src/lib/algorithms/pipeline';
import { accepts, simulate } from '../src/lib/simulation/simulate';
import { allWords, equivalentPairs, toJsRegExp } from './helpers';

/** Casos obligatorios de la especificación, con cadenas aceptadas y rechazadas. */
const CASES: { regex: string; yes: string[]; no: string[] }[] = [
	{ regex: 'a', yes: ['a'], no: ['', 'b', 'aa'] },
	{ regex: 'ab', yes: ['ab'], no: ['', 'a', 'b', 'ba', 'abb'] },
	{ regex: 'a+b', yes: ['a', 'b'], no: ['', 'ab', 'aa'] },
	{ regex: 'a*', yes: ['', 'a', 'aaaa'], no: ['b', 'ab'] },
	{ regex: '(a+b)+c', yes: ['a', 'b', 'c'], no: ['', 'ab', 'cc'] },
	{ regex: 'a(b+c)', yes: ['ab', 'ac'], no: ['', 'a', 'bc', 'abc'] },
	{ regex: '(a+b)*abb', yes: ['abb', 'aabb', 'babb', 'ababb'], no: ['', 'ab', 'abba', 'bb'] },
	{ regex: '(a+b)*', yes: ['', 'a', 'b', 'abba'], no: [] },
	{ regex: 'ε', yes: [''], no: ['a'] },
	{ regex: '∅', yes: [], no: ['', 'a'] },
	{ regex: 'aε', yes: ['a'], no: ['', 'aa'] },
	{ regex: 'a+∅', yes: ['a'], no: ['', 'aa'] },
	{ regex: '((a(b+ε))*c)*', yes: ['', 'c', 'ac', 'abc', 'aabcc', 'cc'], no: ['a', 'ab', 'ca', 'b'] },
	{ regex: '(((a)))((b)*)', yes: ['a', 'ab', 'abbb'], no: ['', 'b', 'ba'] },
	{ regex: '∅*', yes: [''], no: ['a'] },
	{ regex: 'a∅b', yes: [], no: ['', 'ab', 'a'] }
];

function allBuilt(regex: string): { name: string; automaton: Automaton }[] {
	const ast = parseRegex(regex);
	const t = thompson(ast).automaton;
	const s = subsetConstruction(t).automaton;
	const d = directConstruction(ast).automaton;
	return [
		{ name: 'Thompson', automaton: t },
		{ name: 'AFN sin ε', automaton: eliminateEpsilon(t).automaton },
		{ name: 'Subconjuntos', automaton: s },
		{ name: 'Directo', automaton: d },
		{ name: 'Mínimo (subconjuntos)', automaton: minimizeDfa(s).automaton },
		{ name: 'Mínimo (directo)', automaton: minimizeDfa(d).automaton },
		{ name: 'Mínimo completo', automaton: minimizeDfa(d, { keepSink: true }).automaton }
	];
}

describe('casos de la especificación: todos los métodos aceptan el lenguaje correcto', () => {
	for (const c of CASES) {
		it(c.regex, () => {
			const oracle = toJsRegExp(parseRegex(c.regex));
			for (const { name, automaton } of allBuilt(c.regex)) {
				for (const w of c.yes) expect(accepts(automaton, w), `${name} debe aceptar «${w}»`).toBe(true);
				for (const w of c.no) expect(accepts(automaton, w), `${name} debe rechazar «${w}»`).toBe(false);
				for (const w of allWords(['a', 'b', 'c'], 4)) {
					expect(accepts(automaton, w), `${name} con «${w}»`).toBe(oracle.test(w));
				}
			}
		});
	}
});

describe('Thompson', () => {
	it('produce un AFN-ε estructuralmente válido', () => {
		for (const { regex } of CASES) {
			const ast = parseRegex(regex);
			const a = thompson(ast).automaton;
			const index = new AutomatonIndex(a);
			expect(a.kind).toBe('enfa');
			expect(a.accepting).toHaveLength(1);
			const accept = a.accepting[0] as string;
			// El inicial no tiene transiciones de entrada y el final no tiene de salida.
			expect(a.transitions.some((t) => t.to === a.start)).toBe(false);
			expect(index.allFrom(accept)).toHaveLength(0);
			for (const s of a.states) {
				const out = index.allFrom(s.id);
				expect(out.length).toBeLessThanOrEqual(2);
				// Un estado con transición de símbolo tiene solo esa salida.
				if (out.some((t) => t.symbol !== null)) expect(out).toHaveLength(1);
			}
			// Dos estados por hoja, unión y cerradura; ninguno por concatenación.
			const nodes = postOrder(ast);
			expect(a.states).toHaveLength(2 * nodes.filter((n) => n.kind !== 'concat').length);
			// Todas las transiciones conectan estados existentes y tienen id único.
			const ids = new Set(a.states.map((s) => s.id));
			for (const t of a.transitions) expect(ids.has(t.from) && ids.has(t.to)).toBe(true);
			expect(new Set(a.transitions.map((t) => t.id)).size).toBe(a.transitions.length);
		}
	});

	it('genera un paso por nodo del árbol más el resumen final', () => {
		const ast = parseRegex('a(b+c)');
		const { steps } = thompson(ast);
		expect(steps).toHaveLength(postOrder(ast).length + 1);
		expect(steps.map((s) => s.title)).toEqual([
			'Fragmento básico para «a»',
			'Fragmento básico para «b»',
			'Fragmento básico para «c»',
			'Unión «b+c»',
			'Concatenación «a(b+c)»',
			'AFN-ε completo'
		]);
	});
});

describe('subconjuntos', () => {
	it('genera AFD deterministas cuyos estados son ε-cerraduras', () => {
		for (const { regex } of CASES) {
			const t = thompson(parseRegex(regex)).automaton;
			const d = subsetConstruction(t).automaton;
			expect(isDeterministic(d)).toBe(true);
			const index = new AutomatonIndex(t);
			for (const s of d.states) {
				const set = s.detail?.nfaStates ?? [];
				expect(epsilonClosure(index, set)).toEqual(set);
				expect(d.accepting.includes(s.id)).toBe(set.some((q) => t.accepting.includes(q)));
			}
		}
	});

	it('reproduce el ejemplo clásico (a+b)*abb con 5 estados', () => {
		const d = subsetConstruction(thompson(parseRegex('(a+b)*abb')).automaton).automaton;
		expect(d.states).toHaveLength(5);
		expect(d.accepting).toHaveLength(1);
	});

	it('respeta el límite de estados', () => {
		// (a+b)*a(a+b)^k necesita 2^(k+1) estados.
		const regex = `(a+b)*a${'(a+b)'.repeat(9)}`;
		expect(() => subsetConstruction(thompson(parseRegex(regex)).automaton)).toThrow(AutomatonLimitError);
	});
});

describe('eliminación de ε', () => {
	it('no deja transiciones ε y conserva el lenguaje (equivalencia formal)', () => {
		for (const { regex } of CASES) {
			const t = thompson(parseRegex(regex)).automaton;
			const e = eliminateEpsilon(t).automaton;
			expect(e.transitions.every((x) => x.symbol !== null)).toBe(true);
			expect(checkEquivalence(t, e).equivalent).toBe(true);
		}
	});
});

describe('construcción directa', () => {
	it('calcula nullable, firstpos, lastpos y followpos del ejemplo del libro', () => {
		const tree = buildAugmentedTree(parseRegex('(a+b)*abb'));
		const root = tree.nodes[tree.root];
		expect(tree.positions.map((p) => p.symbol)).toEqual(['a', 'b', 'a', 'b', 'b', '#']);
		expect(root?.nullable).toBe(false);
		expect(root?.firstpos).toEqual([1, 2, 3]);
		expect(root?.lastpos).toEqual([6]);
		expect(tree.followpos).toEqual([[1, 2, 3], [1, 2, 3], [4], [5], [6], []]);
	});

	it('trata ε y ∅ en el árbol', () => {
		const eps = buildAugmentedTree(parseRegex('ε'));
		expect(eps.nodes.find((n) => n.kind === 'epsilon')?.nullable).toBe(true);
		const empty = buildAugmentedTree(parseRegex('a∅'));
		expect(empty.nodes[empty.root]?.firstpos).toEqual([1]);
		expect(empty.followpos[0]).toEqual([]);
	});

	it('produce AFD deterministas equivalentes a Thompson', () => {
		for (const { regex } of CASES) {
			const ast = parseRegex(regex);
			const d = directConstruction(ast).automaton;
			expect(isDeterministic(d)).toBe(true);
			expect(checkEquivalence(thompson(ast).automaton, d).equivalent).toBe(true);
		}
	});

	it('da 4 estados para (a+b)*abb', () => {
		expect(directConstruction(parseRegex('(a+b)*abb')).automaton.states).toHaveLength(4);
	});
});

describe('minimización', () => {
	it('conserva el lenguaje y no deja estados equivalentes', () => {
		for (const { regex } of CASES) {
			const ast = parseRegex(regex);
			const d = subsetConstruction(thompson(ast).automaton).automaton;
			for (const keepSink of [false, true]) {
				const m = minimizeDfa(d, { keepSink }).automaton;
				expect(isDeterministic(m)).toBe(true);
				expect(checkEquivalence(d, m).equivalent).toBe(true);
				expect(equivalentPairs(m)).toEqual([]);
				if (keepSink) expect(isComplete(m)).toBe(true);
				// Sin sumidero, el único estado muerto permitido es el inicial (lenguaje vacío).
				else expect(deadStates(m).filter((x) => x !== m.start)).toEqual([]);
			}
		}
	});

	it('fusiona exactamente los estados equivalentes de (a+b)*abb', () => {
		const d = subsetConstruction(thompson(parseRegex('(a+b)*abb')).automaton).automaton;
		const r = minimizeDfa(d);
		expect(r.automaton.states).toHaveLength(4);
		expect(r.merges).toHaveLength(1);
		expect(r.merges[0]?.members).toEqual(['A', 'C']);
		expect(r.sinkRemoved).toBe(false);
	});

	it('no fusiona estados distinguibles', () => {
		// a*b*: los tres estados (antes de b, después de b, muerto) son distinguibles.
		const d = directConstruction(parseRegex('a*b*')).automaton;
		const r = minimizeDfa(d, { keepSink: true });
		expect(r.automaton.states).toHaveLength(3);
		expect(equivalentPairs(r.automaton)).toEqual([]);
	});

	it('el lenguaje vacío se reduce a un único estado no final', () => {
		const d = directConstruction(parseRegex('∅')).automaton;
		const m = minimizeDfa(d).automaton;
		expect(m.states).toHaveLength(1);
		expect(m.accepting).toHaveLength(0);
	});
});

describe('equivalencia formal', () => {
	it('encuentra el contraejemplo más corto', () => {
		const a = directConstruction(parseRegex('a*')).automaton;
		const b = directConstruction(parseRegex('aa*')).automaton;
		expect(checkEquivalence(a, b)).toEqual({ equivalent: false, counterexample: '', acceptedBy: 'first' });
		const c = directConstruction(parseRegex('(a+b)*')).automaton;
		const d = directConstruction(parseRegex('(a*b*)*')).automaton;
		expect(checkEquivalence(c, d).equivalent).toBe(true);
	});
});

describe('simulación', () => {
	it('sigue una única transición en un AFD y explica el rechazo', () => {
		const d = directConstruction(parseRegex('ab')).automaton;
		const ok = simulate(d, 'ab');
		expect(ok.accepted).toBe(true);
		expect(ok.steps.map((s) => s.active)).toEqual([['A'], ['B'], ['C']]);
		const dead = simulate(d, 'b');
		expect(dead.accepted).toBe(false);
		expect(dead.verdict).toMatch(/ningún estado activo/);
		const invalid = simulate(d, 'ax');
		expect(invalid.invalidSymbol).toEqual({ symbol: 'x', index: 1 });
	});

	it('usa ε-cerraduras en un AFN-ε y trata la cadena vacía', () => {
		const t = thompson(parseRegex('a*')).automaton;
		const r = simulate(t, '');
		expect(r.accepted).toBe(true);
		expect(r.steps).toHaveLength(1);
		expect(r.steps[0]?.active.length).toBeGreaterThan(1);
		expect(simulate(t, 'ε').accepted).toBe(true);
		expect(simulate(t, ' a a ').input).toBe('aa');
	});
});

describe('pipeline', () => {
	const base: ConversionOptions = { method: 'thompson', target: 'enfa', minimizationSource: 'subsets', showSink: false };

	it('ejecuta las etapas necesarias e informa los pasos adicionales', () => {
		const ast = parseRegex('(a+b)*abb');
		const nfa = convert(ast, '(a+b)*abb', { ...base, target: 'nfa' });
		expect(nfa.stages.map((s) => s.id)).toEqual(['thompson', 'epsilon']);
		expect(nfa.notes.length).toBeGreaterThan(0);
		expect(nfa.automaton.kind).toBe('nfa');

		const min = convert(ast, '', { ...base, method: 'direct', target: 'mindfa' });
		expect(min.stages.map((s) => s.id)).toEqual(['direct', 'minimize']);
		expect(min.automaton.kind).toBe('mindfa');
		expect(min.automaton.states).toHaveLength(4);

		const viaSubsets = convert(ast, '', { ...base, method: 'subsets', target: 'dfa' });
		expect(viaSubsets.stages.map((s) => [s.id, s.extra])).toEqual([
			['thompson', true],
			['subsets', false]
		]);

		const sink = convert(parseRegex('ab'), '', { ...base, method: 'direct', target: 'dfa', showSink: true });
		expect(sink.stages.map((s) => s.id)).toEqual(['direct', 'complete']);
		expect(isComplete(sink.automaton)).toBe(true);
	});

	it('no ofrece tipos que el método no genera y corrige combinaciones inválidas', () => {
		expect(targetAvailability('direct').enfa.enabled).toBe(false);
		expect(targetAvailability('minimization').dfa.enabled).toBe(false);
		const r = convert(parseRegex('a'), 'a', { ...base, method: 'direct', target: 'enfa' });
		expect(r.automaton.kind).toBe('dfa');
	});

	it('nunca etiqueta como mínimo un autómata sin minimizar', () => {
		for (const method of ['thompson', 'subsets', 'direct', 'minimization'] as const) {
			for (const target of ['enfa', 'nfa', 'dfa', 'mindfa'] as const) {
				const r = convert(parseRegex('(a+b)*abb'), '', { ...base, method, target });
				if (r.automaton.kind === 'mindfa') expect(r.stages.some((s) => s.id === 'minimize')).toBe(true);
				if (r.automaton.kind === 'dfa' || r.automaton.kind === 'mindfa') expect(isDeterministic(r.automaton)).toBe(true);
				if (r.automaton.kind === 'nfa') expect(r.automaton.transitions.every((t) => t.symbol !== null)).toBe(true);
			}
		}
	});
});

describe('comparación de métodos', () => {
	it('todos los métodos son equivalentes y los AFD mínimos coinciden', () => {
		const r = compareMethods(parseRegex('(a+b)*abb'));
		expect(r.allEquivalent).toBe(true);
		expect(r.minimalSizesMatch).toBe(true);
		for (const s of r.samples) expect(new Set(s.results).size).toBe(1);
	});
});
