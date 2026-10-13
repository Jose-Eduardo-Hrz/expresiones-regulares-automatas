import { describe, expect, it } from 'vitest';
import { parseRegex } from '../src/lib/regex/parser';
import { toRegexString } from '../src/lib/regex/ast';
import { isDeterministic } from '../src/lib/automata/core';
import { thompson } from '../src/lib/algorithms/thompson';
import { subsetConstruction } from '../src/lib/algorithms/subsets';
import { eliminateEpsilon } from '../src/lib/algorithms/epsilonElimination';
import { directConstruction } from '../src/lib/algorithms/direct';
import { minimizeDfa } from '../src/lib/algorithms/minimize';
import { checkEquivalence } from '../src/lib/algorithms/equivalence';
import { accepts } from '../src/lib/simulation/simulate';
import { allWords, equivalentPairs, randomRegex, rng, toJsRegExp } from './helpers';

/**
 * Pruebas con expresiones aleatorias: cada método se contrasta formalmente
 * con los demás (equivalencia de autómatas) y con un oráculo independiente
 * (RegExp de JavaScript) sobre todas las cadenas de longitud ≤ 5.
 */
describe('expresiones aleatorias', () => {
	const random = rng(20261013);
	const words = allWords(['a', 'b'], 5);
	const total = 250;

	it(`${total} expresiones: todos los métodos coinciden`, () => {
		for (let i = 0; i < total; i++) {
			const src = randomRegex(random, 4);
			const ast = parseRegex(src);
			expect(toRegexString(parseRegex(toRegexString(ast)))).toBe(toRegexString(ast));
			const oracle = toJsRegExp(ast);
			const t = thompson(ast).automaton;
			const e = eliminateEpsilon(t).automaton;
			const s = subsetConstruction(t).automaton;
			const d = directConstruction(ast).automaton;
			const ms = minimizeDfa(s).automaton;
			const md = minimizeDfa(d).automaton;

			expect(isDeterministic(s), src).toBe(true);
			expect(isDeterministic(d), src).toBe(true);
			for (const other of [e, s, d, ms, md]) expect(checkEquivalence(t, other).equivalent, src).toBe(true);
			// El AFD mínimo es único: ambos caminos dan la misma cantidad de estados.
			expect(ms.states.length, src).toBe(md.states.length);
			expect(equivalentPairs(md), src).toEqual([]);
			for (const w of words) {
				const expected = oracle.test(w);
				expect(accepts(t, w), `${src} / ${w}`).toBe(expected);
				expect(accepts(md, w), `${src} / ${w}`).toBe(expected);
			}
		}
	});

	it('la equivalencia detecta lenguajes distintos', () => {
		let differences = 0;
		for (let i = 0; i < 60; i++) {
			const a = parseRegex(randomRegex(random, 3));
			const b = parseRegex(randomRegex(random, 3));
			const r = checkEquivalence(directConstruction(a).automaton, directConstruction(b).automaton);
			const oa = toJsRegExp(a);
			const ob = toJsRegExp(b);
			if (!r.equivalent) {
				differences++;
				const w = r.counterexample as string;
				expect(oa.test(w)).not.toBe(ob.test(w));
				expect(oa.test(w)).toBe(r.acceptedBy === 'first');
			} else {
				for (const w of words) expect(oa.test(w)).toBe(ob.test(w));
			}
		}
		expect(differences).toBeGreaterThan(0);
	});
});
