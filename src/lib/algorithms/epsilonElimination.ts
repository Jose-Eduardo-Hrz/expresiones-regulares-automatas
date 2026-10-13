import { AutomatonIndex, epsilonClosure, formatSet, move } from '#lib/automata/core.ts';
import type { Automaton } from '#lib/automata/types.ts';
import type { AlgorithmStep } from './steps';

export interface EpsilonEliminationResult {
	automaton: Automaton;
	steps: AlgorithmStep[];
	/** Estados del AFN-ε que dejan de ser alcanzables y se descartan. */
	removed: string[];
}

/**
 * Elimina las transiciones ε de un AFN-ε conservando el lenguaje:
 *
 *   δ'(p, a) = mover(ε-cerradura(p), a)
 *   p es final  ⇔  ε-cerradura(p) contiene un estado final
 *
 * Un camino p ε* a ε* b … ε* f del AFN-ε se convierte en p —a→ … —b→ q,
 * con q final porque su ε-cerradura alcanza f. Solo se conservan los estados
 * alcanzables desde el inicial en el nuevo autómata (el inicial y los
 * destinos de transiciones con símbolo); el resto se descarta.
 */
export function eliminateEpsilon(enfa: Automaton): EpsilonEliminationResult {
	const index = new AutomatonIndex(enfa);
	const nfa: Automaton = {
		kind: 'nfa',
		alphabet: [...enfa.alphabet],
		states: [],
		start: enfa.start,
		accepting: [],
		transitions: []
	};
	const steps: AlgorithmStep[] = [];
	const discovered = new Set<string>([enfa.start]);
	const queue = [enfa.start];
	const noteOf = new Map(enfa.states.map((s) => [s.id, s.detail?.note]));

	const addState = (id: string): void => {
		const note = noteOf.get(id);
		nfa.states.push({ id, detail: note ? { note } : {} });
	};
	addState(enfa.start);

	while (queue.length > 0) {
		const p = queue.shift() as string;
		const closure = epsilonClosure(index, [p]);
		const finals = closure.filter((s) => index.isAccepting(s));
		if (finals.length > 0) nfa.accepting.push(p);
		const details = [`ε-cerradura(${p}) = ${formatSet(closure)}`];
		const newStates: string[] = [];
		const newTransitions: string[] = [];
		for (const symbol of enfa.alphabet) {
			const targets = move(index, closure, symbol);
			if (targets.length === 0) continue;
			for (const q of targets) {
				const id = `t${nfa.transitions.length}`;
				nfa.transitions.push({ id, from: p, to: q, symbol });
				newTransitions.push(id);
				if (!discovered.has(q)) {
					discovered.add(q);
					queue.push(q);
					addState(q);
					newStates.push(q);
				}
			}
			details.push(`δ'(${p}, ${symbol}) = mover(${formatSet(closure)}, ${symbol}) = ${formatSet(targets)}`);
		}
		details.push(
			finals.length > 0
				? `La cerradura contiene ${formatSet(finals)} (final del AFN-ε) → ${p} es de aceptación.`
				: `La cerradura no contiene estados finales → ${p} no es de aceptación.`
		);
		steps.push({
			stage: 'epsilon',
			title: `Transiciones de ${p}`,
			description: `Desde ${p} se recorren primero todas las transiciones ε (su ε-cerradura) y después se consume cada símbolo. Cada destino alcanzado se convierte en una transición directa desde ${p}.`,
			details,
			view: {
				kind: 'automaton',
				automaton: nfa,
				visibleStates: nfa.states.length,
				visibleTransitions: nfa.transitions.length
			},
			highlight: { states: newStates, transitions: newTransitions, contextStates: [p] }
		});
	}

	const removed = enfa.states.filter((s) => !discovered.has(s.id)).map((s) => s.id);
	steps.push({
		stage: 'epsilon',
		title: 'AFN sin transiciones ε',
		description:
			removed.length > 0
				? `Se descartan ${removed.length} estados del AFN-ε a los que solo se llegaba mediante transiciones ε; ya no son necesarios porque sus cerraduras quedaron incorporadas en las nuevas transiciones.`
				: 'Todos los estados del AFN-ε siguen siendo alcanzables.',
		details: [
			...(removed.length > 0 ? [`Descartados: ${formatSet(removed)}`] : []),
			`Resultado: ${nfa.states.length} estados, ${nfa.transitions.length} transiciones, aceptación ${formatSet(nfa.accepting)}.`
		],
		view: { kind: 'automaton', automaton: nfa },
		highlight: { states: [...nfa.accepting], transitions: [] }
	});
	return { automaton: nfa, steps, removed };
}
