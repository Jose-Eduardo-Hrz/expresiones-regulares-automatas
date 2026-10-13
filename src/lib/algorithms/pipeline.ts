import { alphabetOf, toRegexString, type RegexNode } from '#lib/regex/ast.ts';
import { SINK_STATE, completeDfa } from '#lib/automata/core.ts';
import { AUTOMATON_NAMES, type Automaton, type AutomatonKind } from '#lib/automata/types.ts';
import { buildAugmentedTree, directConstruction, type AugmentedTree } from './direct';
import { eliminateEpsilon } from './epsilonElimination';
import { minimizeDfa, type MinimizationResult } from './minimize';
import { STAGE_NAMES, type AlgorithmStep, type StageId } from './steps';
import { subsetConstruction } from './subsets';
import { thompson } from './thompson';

export type MethodId = 'thompson' | 'subsets' | 'direct' | 'minimization';
export type DfaSource = 'subsets' | 'direct';

export interface MethodInfo {
	id: MethodId;
	name: string;
	summary: string;
	/** Descripción del algoritmo para el panel de información. */
	description: string[];
}

export const METHODS: MethodInfo[] = [
	{
		id: 'thompson',
		name: 'Thompson',
		summary: 'Expresión → AFN-ε por fragmentos',
		description: [
			'Recorre el árbol sintáctico de abajo hacia arriba y construye un fragmento de autómata para cada subexpresión. Cada fragmento tiene un único estado inicial y un único estado final.',
			'Los símbolos y ε producen dos estados unidos por una transición. La unión agrega un inicio y un final nuevos conectados con ε a las dos alternativas; la concatenación une el final del primer fragmento con el inicio del segundo mediante ε; la cerradura agrega un inicio y un final nuevos y transiciones ε para repetir o saltar el fragmento.',
			'El resultado tiene a lo sumo 2·n estados para una expresión con n operadores y operandos, y cada estado tiene como máximo dos transiciones salientes.'
		]
	},
	{
		id: 'subsets',
		name: 'Subconjuntos',
		summary: 'AFN-ε → AFD por conjuntos de estados',
		description: [
			'Determiniza el AFN-ε de Thompson. Cada estado del AFD representa el conjunto de estados en los que el AFN podría encontrarse simultáneamente.',
			'El estado inicial es la ε-cerradura del inicial del AFN. Para cada estado T y cada símbolo a se calcula U = ε-cerradura(mover(T, a)); si U es nuevo se agrega al AFD. Solo se generan los subconjuntos alcanzables.',
			'Un estado del AFD es de aceptación si contiene algún estado de aceptación del AFN.'
		]
	},
	{
		id: 'direct',
		name: 'Directo (followpos)',
		summary: 'Expresión → AFD con nullable, firstpos, lastpos y followpos',
		description: [
			'Construye el AFD sin pasar por un AFN. Se aumenta la expresión con un marcador de fin (r)# y se numeran las hojas con símbolo (posiciones).',
			'Para cada nodo se calculan nullable (¿genera ε?), firstpos (posiciones que pueden iniciar una cadena) y lastpos (posiciones que pueden terminarla). Con ellas se obtiene followpos(i): las posiciones que pueden seguir a la posición i.',
			'Los estados del AFD son conjuntos de posiciones. El inicial es firstpos(raíz); desde un estado S con el símbolo a se va a la unión de followpos(p) para las posiciones p de S etiquetadas con a. Son de aceptación los estados que contienen la posición de #.'
		]
	},
	{
		id: 'minimization',
		name: 'Minimización',
		summary: 'AFD → AFD mínimo (Hopcroft)',
		description: [
			'Parte de un AFD completo y sin estados inalcanzables y busca los grupos de estados equivalentes, es decir, los que aceptan exactamente las mismas continuaciones.',
			'Algoritmo de Hopcroft: la partición inicial separa los estados de aceptación de los demás. Un divisor (C, a) separa un bloque cuando algunos de sus estados van a C con a y otros no. El proceso termina cuando ningún divisor pendiente separa nada.',
			'Cada bloque final se convierte en un estado del AFD mínimo, que es único salvo el nombre de sus estados.'
		]
	}
];

export interface ConversionOptions {
	method: MethodId;
	target: AutomatonKind;
	/** AFD de partida cuando el método es «Minimización». */
	minimizationSource: DfaSource;
	/** Mostrar el estado sumidero en AFD y AFD mínimo. */
	showSink: boolean;
}

export interface TargetAvailability {
	enabled: boolean;
	reason?: string;
}

export function targetAvailability(method: MethodId): Record<AutomatonKind, TargetAvailability> {
	switch (method) {
		case 'thompson':
			return { enfa: { enabled: true }, nfa: { enabled: true }, dfa: { enabled: true }, mindfa: { enabled: true } };
		case 'subsets': {
			const reason = 'El algoritmo de subconjuntos produce un AFD. Para ver el AFN-ε o el AFN elige Thompson.';
			return { enfa: { enabled: false, reason }, nfa: { enabled: false, reason }, dfa: { enabled: true }, mindfa: { enabled: true } };
		}
		case 'direct': {
			const reason = 'La construcción directa produce un AFD sin pasar por ningún AFN.';
			return { enfa: { enabled: false, reason }, nfa: { enabled: false, reason }, dfa: { enabled: true }, mindfa: { enabled: true } };
		}
		case 'minimization': {
			const reason = 'La minimización siempre produce un AFD mínimo.';
			return {
				enfa: { enabled: false, reason },
				nfa: { enabled: false, reason },
				dfa: { enabled: false, reason },
				mindfa: { enabled: true }
			};
		}
	}
}

/** Ajusta el tipo de autómata a uno compatible con el método. */
export function compatibleTarget(method: MethodId, target: AutomatonKind): AutomatonKind {
	const availability = targetAvailability(method);
	if (availability[target].enabled) return target;
	return method === 'minimization' ? 'mindfa' : 'dfa';
}

export interface StageSummary {
	id: StageId;
	name: string;
	/** Etapa ejecutada además del método elegido para llegar al tipo pedido. */
	extra: boolean;
	/** Autómata producido por la etapa. */
	automaton?: Automaton;
	/** Índice del primer paso de la etapa en `steps`. */
	firstStep: number;
}

export interface ConversionResult {
	source: string;
	/** Expresión en forma canónica. */
	regexText: string;
	ast: RegexNode;
	alphabet: string[];
	options: ConversionOptions;
	automaton: Automaton;
	stages: StageSummary[];
	steps: AlgorithmStep[];
	/** Explicaciones de las conversiones intermedias que se ejecutaron. */
	notes: string[];
	/** Árbol aumentado con nullable/firstpos/lastpos/followpos (siempre disponible). */
	tree: AugmentedTree;
	minimization?: MinimizationResult;
}

/** Ejecuta la secuencia de algoritmos necesaria para el método y el tipo elegidos. */
export function convert(ast: RegexNode, source: string, requested: ConversionOptions): ConversionResult {
	const options: ConversionOptions = { ...requested, target: compatibleTarget(requested.method, requested.target) };
	const { method, target } = options;
	const stages: StageSummary[] = [];
	const steps: AlgorithmStep[] = [];
	const notes: string[] = [];
	const add = (id: StageId, extra: boolean, automaton: Automaton | undefined, stageSteps: AlgorithmStep[]): void => {
		stages.push({ id, name: STAGE_NAMES[id], extra, automaton, firstStep: steps.length });
		steps.push(...stageSteps);
	};

	let current: Automaton;
	let tree: AugmentedTree | undefined;
	let minimization: MinimizationResult | undefined;

	const dfaFrom = (useDirect: boolean, extra: boolean): Automaton => {
		if (useDirect) {
			const r = directConstruction(ast);
			tree = r.tree;
			add('direct', extra, r.automaton, r.steps);
			return r.automaton;
		}
		const t = thompson(ast);
		add('thompson', method !== 'thompson', t.automaton, t.steps);
		const s = subsetConstruction(t.automaton);
		add('subsets', extra && method !== 'subsets', s.automaton, s.steps);
		return s.automaton;
	};

	if (target === 'enfa' || target === 'nfa') {
		const t = thompson(ast);
		add('thompson', false, t.automaton, t.steps);
		current = t.automaton;
		if (target === 'nfa') {
			const e = eliminateEpsilon(t.automaton);
			add('epsilon', true, e.automaton, e.steps);
			current = e.automaton;
			notes.push('Thompson produce un AFN-ε; para obtener un AFN sin transiciones ε se aplicó además la eliminación de transiciones ε.');
		}
	} else {
		const useDirect = method === 'direct' || (method === 'minimization' && options.minimizationSource === 'direct');
		current = dfaFrom(useDirect, method === 'thompson' || method === 'minimization');
		if (method === 'thompson') {
			notes.push('Thompson produce un AFN-ε; para obtener un AFD se aplicó además la construcción por subconjuntos.');
		} else if (method === 'subsets') {
			notes.push('El algoritmo de subconjuntos necesita un AFN-ε de partida: primero se ejecutó la construcción de Thompson.');
		} else if (method === 'minimization') {
			notes.push(
				useDirect
					? 'La minimización parte de un AFD: primero se ejecutó la construcción directa (followpos).'
					: 'La minimización parte de un AFD: primero se ejecutaron Thompson y la construcción por subconjuntos.'
			);
		}

		if (target === 'mindfa') {
			minimization = minimizeDfa(current, { keepSink: options.showSink });
			add('minimize', method !== 'minimization', minimization.automaton, minimization.steps);
			current = minimization.automaton;
			if (method !== 'minimization') notes.push('Para obtener el AFD mínimo se aplicó además el algoritmo de minimización de Hopcroft.');
		} else if (options.showSink) {
			const { automaton: complete, added } = completeDfa(current);
			if (added.length > 0) {
				add('complete', true, complete, [
					{
						stage: 'complete',
						title: 'Agregar el estado sumidero',
						description: `Se agrega el estado sumidero ${SINK_STATE} (no final) y todas las transiciones faltantes van hacia él, de modo que la función de transición queda definida para cada estado y símbolo.`,
						details: added.map((t) => `${t.from} —${t.symbol}→ ${t.to}`),
						view: { kind: 'automaton', automaton: complete },
						highlight: { states: [SINK_STATE], transitions: added.map((t) => t.id) }
					}
				]);
				current = complete;
				notes.push(`Se agregó el estado sumidero ${SINK_STATE} para mostrar el AFD completo.`);
			} else {
				notes.push('El AFD ya es completo: no hace falta un estado sumidero.');
			}
		}
	}

	// Cada etapa ya produce el tipo pedido; se conserva el mismo objeto para que
	// la vista de resultado y la del último paso compartan la distribución.
	const automaton = current;
	if (automaton.kind !== target) throw new Error(`Se esperaba un ${AUTOMATON_NAMES[target]} y se obtuvo un ${AUTOMATON_NAMES[automaton.kind]}.`);
	return {
		source,
		regexText: toRegexString(ast),
		ast,
		alphabet: alphabetOf(ast),
		options,
		automaton,
		stages,
		steps,
		notes,
		tree: tree ?? buildAugmentedTree(ast),
		minimization
	};
}

export function describeTarget(kind: AutomatonKind): string {
	return AUTOMATON_NAMES[kind];
}
