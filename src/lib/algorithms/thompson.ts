import { alphabetOf, toRegexString, type RegexNode } from '#lib/regex/ast.ts';
import { AutomatonLimitError, MAX_STATES } from '#lib/automata/core.ts';
import type { Automaton, Transition } from '#lib/automata/types.ts';
import type { AlgorithmStep } from './steps';

/** Fragmento de Thompson: un estado inicial y uno final únicos. */
export interface Fragment {
	start: string;
	accept: string;
	/** Todos los estados del fragmento. */
	states: string[];
	/** Todas las transiciones del fragmento. */
	transitions: string[];
}

export interface ThompsonResult {
	automaton: Automaton;
	steps: AlgorithmStep[];
}

/**
 * Construcción de Thompson. Cada nodo del árbol, en orden posterior, produce
 * un fragmento con un único estado inicial (sin transiciones de entrada) y
 * un único estado final (sin transiciones de salida).
 *
 * Variante usada para la concatenación: el final del primer fragmento se
 * une al inicio del segundo con una transición ε (en lugar de fusionar ambos
 * estados), de modo que los estados creados en cada paso nunca cambian.
 */
export function thompson(ast: RegexNode): ThompsonResult {
	const automaton: Automaton = {
		kind: 'enfa',
		alphabet: alphabetOf(ast),
		states: [],
		start: '',
		accepting: [],
		transitions: []
	};
	const steps: AlgorithmStep[] = [];

	const newState = (note: string): string => {
		if (automaton.states.length >= MAX_STATES) throw new AutomatonLimitError('El AFN-ε de Thompson');
		const id = `q${automaton.states.length}`;
		automaton.states.push({ id, detail: { note } });
		return id;
	};
	const addTransition = (from: string, to: string, symbol: string | null): string => {
		const t: Transition = { id: `t${automaton.transitions.length}`, from, to, symbol };
		automaton.transitions.push(t);
		return t.id;
	};
	const record = (
		title: string,
		description: string,
		details: string[],
		created: string[],
		createdTransitions: string[],
		context: Fragment[]
	): void => {
		steps.push({
			stage: 'thompson',
			title,
			description,
			details,
			view: {
				kind: 'automaton',
				automaton,
				visibleStates: automaton.states.length,
				visibleTransitions: automaton.transitions.length,
				hideRoles: true
			},
			highlight: {
				states: created,
				transitions: createdTransitions,
				contextStates: context.flatMap((f) => f.states),
				contextTransitions: context.flatMap((f) => f.transitions)
			}
		});
	};

	const build = (node: RegexNode): Fragment => {
		const text = toRegexString(node);
		switch (node.kind) {
			case 'symbol':
			case 'epsilon': {
				const label = node.kind === 'symbol' ? node.value : 'ε';
				const s = newState(`Inicio del fragmento de «${text}»`);
				const f = newState(`Final del fragmento de «${text}»`);
				const t = addTransition(s, f, node.kind === 'symbol' ? node.value : null);
				record(
					node.kind === 'symbol' ? `Fragmento básico para «${label}»` : 'Fragmento para ε',
					node.kind === 'symbol'
						? `Se crean el estado inicial ${s} y el final ${f}, unidos por una transición con el símbolo «${label}». El fragmento acepta exactamente la cadena «${label}».`
						: `Se crean ${s} y ${f} unidos por una transición ε. El fragmento acepta solo la cadena vacía.`,
					[`${s} —${label}→ ${f}`],
					[s, f],
					[t],
					[]
				);
				return { start: s, accept: f, states: [s, f], transitions: [t] };
			}
			case 'empty': {
				const s = newState('Inicio del fragmento de «∅»');
				const f = newState('Final del fragmento de «∅»');
				record(
					'Fragmento para ∅',
					`Se crean ${s} y ${f} sin ninguna transición entre ellos. El estado final es inalcanzable, así que el fragmento no acepta ninguna cadena (lenguaje vacío).`,
					[`${s} y ${f} quedan desconectados`],
					[s, f],
					[],
					[]
				);
				return { start: s, accept: f, states: [s, f], transitions: [] };
			}
			case 'union': {
				const a = build(node.left);
				const b = build(node.right);
				const left = toRegexString(node.left);
				const right = toRegexString(node.right);
				const s = newState(`Inicio de la unión «${text}»`);
				const f = newState(`Final de la unión «${text}»`);
				const ts = [
					addTransition(s, a.start, null),
					addTransition(s, b.start, null),
					addTransition(a.accept, f, null),
					addTransition(b.accept, f, null)
				];
				record(
					`Unión «${text}»`,
					`Se crea un nuevo estado inicial ${s} que elige, mediante transiciones ε, entre el fragmento de «${left}» (inicio ${a.start}) y el de «${right}» (inicio ${b.start}). Los finales ${a.accept} y ${b.accept} se conectan con ε al nuevo estado final ${f}.`,
					[
						`${s} —ε→ ${a.start}   (entrar a «${left}»)`,
						`${s} —ε→ ${b.start}   (entrar a «${right}»)`,
						`${a.accept} —ε→ ${f}   (salir de «${left}»)`,
						`${b.accept} —ε→ ${f}   (salir de «${right}»)`
					],
					[s, f],
					ts,
					[a, b]
				);
				return {
					start: s,
					accept: f,
					states: [...a.states, ...b.states, s, f],
					transitions: [...a.transitions, ...b.transitions, ...ts]
				};
			}
			case 'concat': {
				const a = build(node.left);
				const b = build(node.right);
				const left = toRegexString(node.left);
				const right = toRegexString(node.right);
				const t = addTransition(a.accept, b.start, null);
				record(
					`Concatenación «${text}»`,
					`El final del fragmento de «${left}» (${a.accept}) se conecta con una transición ε al inicio del fragmento de «${right}» (${b.start}). No se crean estados nuevos: el inicio del resultado es ${a.start} y su final es ${b.accept}.`,
					[`${a.accept} —ε→ ${b.start}`, `Inicio: ${a.start} · Final: ${b.accept}`],
					[],
					[t],
					[a, b]
				);
				return {
					start: a.start,
					accept: b.accept,
					states: [...a.states, ...b.states],
					transitions: [...a.transitions, t, ...b.transitions]
				};
			}
			case 'star': {
				const a = build(node.child);
				const inner = toRegexString(node.child);
				const s = newState(`Inicio de la cerradura «${text}»`);
				const f = newState(`Final de la cerradura «${text}»`);
				const ts = [
					addTransition(s, a.start, null),
					addTransition(s, f, null),
					addTransition(a.accept, a.start, null),
					addTransition(a.accept, f, null)
				];
				record(
					`Cerradura de Kleene «${text}»`,
					`Se crean un nuevo inicio ${s} y un nuevo final ${f}. Desde ${s} se puede entrar al fragmento de «${inner}» o saltar directamente a ${f} (para aceptar la cadena vacía). Desde el final del fragmento (${a.accept}) se puede volver a su inicio (${a.start}) para repetir, o salir hacia ${f}.`,
					[
						`${s} —ε→ ${a.start}   (entrar)`,
						`${s} —ε→ ${f}   (cero repeticiones)`,
						`${a.accept} —ε→ ${a.start}   (repetir)`,
						`${a.accept} —ε→ ${f}   (terminar)`
					],
					[s, f],
					ts,
					[a]
				);
				return {
					start: s,
					accept: f,
					states: [...a.states, s, f],
					transitions: [...a.transitions, ...ts]
				};
			}
		}
	};

	const result = build(ast);
	automaton.start = result.start;
	automaton.accepting = [result.accept];
	steps.push({
		stage: 'thompson',
		title: 'AFN-ε completo',
		description: `El fragmento de la expresión completa «${toRegexString(ast)}» es el autómata final: su estado inicial es ${result.start} y su único estado de aceptación es ${result.accept}.`,
		details: [
			`${automaton.states.length} estados y ${automaton.transitions.length} transiciones (${automaton.transitions.filter((t) => t.symbol === null).length} de ellas ε).`
		],
		view: { kind: 'automaton', automaton },
		highlight: { states: [result.start, result.accept], transitions: [] }
	});
	return { automaton, steps };
}
