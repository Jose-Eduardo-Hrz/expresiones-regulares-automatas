import {
	AutomatonIndex,
	AutomatonLimitError,
	MAX_STATES,
	epsilonClosure,
	formatSet,
	letterName,
	move
} from '#lib/automata/core.ts';
import type { Automaton } from '#lib/automata/types.ts';
import type { AlgorithmStep } from './steps';

export interface SubsetResult {
	automaton: Automaton;
	steps: AlgorithmStep[];
}

/**
 * Construcción por subconjuntos (determinización). Acepta cualquier AFN,
 * con o sin transiciones ε. Cada estado del AFD es la ε-cerradura de un
 * conjunto de estados del AFN; solo se crean los subconjuntos alcanzables.
 *
 * El resultado es un AFD parcial: cuando mover(T, a) es vacío no se crea
 * transición (iría al estado sumidero ∅, que puede añadirse después).
 */
export function subsetConstruction(nfa: Automaton): SubsetResult {
	const index = new AutomatonIndex(nfa);
	const dfa: Automaton = {
		kind: 'dfa',
		alphabet: [...nfa.alphabet],
		states: [],
		start: '',
		accepting: [],
		transitions: []
	};
	const steps: AlgorithmStep[] = [];
	const byKey = new Map<string, string>();
	const sets = new Map<string, string[]>();
	const hasEpsilon = nfa.transitions.some((t) => t.symbol === null);
	const closureName = hasEpsilon ? 'ε-cerradura' : 'conjunto';

	const acceptingIn = (set: string[]): string[] => set.filter((s) => index.isAccepting(s));

	const addState = (set: string[]): { id: string; created: boolean } => {
		const key = set.join('\u0000');
		const existing = byKey.get(key);
		if (existing) return { id: existing, created: false };
		if (dfa.states.length >= MAX_STATES) throw new AutomatonLimitError('El AFD por subconjuntos');
		const id = letterName(dfa.states.length);
		byKey.set(key, id);
		sets.set(id, set);
		dfa.states.push({ id, detail: { nfaStates: set } });
		if (acceptingIn(set).length > 0) dfa.accepting.push(id);
		return { id, created: true };
	};

	const view = (): AlgorithmStep['view'] => ({
		kind: 'automaton',
		automaton: dfa,
		visibleStates: dfa.states.length,
		visibleTransitions: dfa.transitions.length
	});

	const acceptanceNote = (id: string, set: string[]): string => {
		const fin = acceptingIn(set);
		return fin.length > 0
			? `${id} contiene ${formatSet(fin)}, estado(s) de aceptación del AFN → ${id} es de aceptación.`
			: `${id} no contiene estados de aceptación del AFN → ${id} no es de aceptación.`;
	};

	const startSet = epsilonClosure(index, [nfa.start]);
	const start = addState(startSet);
	dfa.start = start.id;
	steps.push({
		stage: 'subsets',
		title: `Estado inicial ${start.id}`,
		description: hasEpsilon
			? `El estado inicial del AFD es la ε-cerradura del estado inicial del AFN: todos los estados alcanzables desde ${nfa.start} usando solo transiciones ε.`
			: `El estado inicial del AFD es el conjunto que contiene solo al estado inicial del AFN.`,
		details: [`${closureName}(${nfa.start}) = ${formatSet(startSet)} = ${start.id}`, acceptanceNote(start.id, startSet)],
		view: view(),
		highlight: { states: [start.id], transitions: [] }
	});

	const queue = [start.id];
	while (queue.length > 0) {
		const current = queue.shift() as string;
		const set = sets.get(current) as string[];
		const details: string[] = [];
		const createdStates: string[] = [];
		const createdTransitions: string[] = [];
		for (const symbol of nfa.alphabet) {
			const moved = move(index, set, symbol);
			if (moved.length === 0) {
				details.push(`mover(${current}, ${symbol}) = ∅ → sin transición (iría al sumidero ∅).`);
				continue;
			}
			const target = epsilonClosure(index, moved);
			const result = addState(target);
			const tid = `t${dfa.transitions.length}`;
			dfa.transitions.push({ id: tid, from: current, to: result.id, symbol });
			createdTransitions.push(tid);
			const movedText = `mover(${current}, ${symbol}) = ${formatSet(moved)}`;
			const closureText = hasEpsilon ? `; ε-cerradura = ${formatSet(target)}` : '';
			if (result.created) {
				createdStates.push(result.id);
				queue.push(result.id);
				details.push(
					`${movedText}${closureText} → nuevo estado ${result.id}. ${acceptanceNote(result.id, target)}`
				);
			} else {
				details.push(`${movedText}${closureText} → ya existe: ${result.id}.`);
			}
		}
		steps.push({
			stage: 'subsets',
			title: `Procesar ${current} = ${formatSet(set)}`,
			description:
				createdStates.length > 0
					? `Se marca ${current} y se calcula, para cada símbolo, a qué conjunto de estados del AFN se llega. Aparecen ${createdStates.length} estado(s) nuevo(s): ${createdStates.join(', ')}.`
					: `Se marca ${current} y se calcula, para cada símbolo, a qué conjunto de estados del AFN se llega. No aparecen estados nuevos.`,
			details,
			view: view(),
			highlight: {
				states: createdStates,
				transitions: createdTransitions,
				contextStates: [current]
			}
		});
	}

	steps.push({
		stage: 'subsets',
		title: 'AFD completo',
		description: `No quedan estados sin marcar. El AFD tiene ${dfa.states.length} estados alcanzables; son de aceptación los que contienen algún estado final del AFN: ${formatSet(dfa.accepting)}.`,
		details: dfa.states.map((s) => `${s.id} = ${formatSet(s.detail?.nfaStates ?? [])}`),
		view: { kind: 'automaton', automaton: dfa },
		highlight: { states: [...dfa.accepting], transitions: [] }
	});

	return { automaton: dfa, steps };
}
