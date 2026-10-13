import {
	AutomatonIndex,
	SINK_STATE,
	completeDfa,
	deadStates,
	formatSet,
	isDeterministic,
	removeUnreachable
} from '#lib/automata/core.ts';
import type { Automaton, State } from '#lib/automata/types.ts';
import type { AlgorithmStep } from './steps';

export interface MergeInfo {
	/** Estado del AFD mínimo. */
	state: string;
	/** Estados del AFD original que se fusionaron en él. */
	members: string[];
	/** Por qué son equivalentes. */
	reasons: string[];
}

export interface MinimizationResult {
	automaton: Automaton;
	steps: AlgorithmStep[];
	/** AFD de entrada, sin inalcanzables y completo (con sumidero si hizo falta). */
	source: Automaton;
	/** Partición final de los estados de `source`. */
	partition: string[][];
	merges: MergeInfo[];
	removedUnreachable: string[];
	/** Se eliminó el estado sumidero del resultado (AFD mínimo parcial). */
	sinkRemoved: boolean;
}

export interface MinimizeOptions {
	/** Conservar el estado sumidero en el resultado (AFD mínimo completo). */
	keepSink?: boolean;
}

interface Block {
	id: number;
	states: Set<string>;
}

/**
 * Minimización de un AFD con el algoritmo de refinamiento de particiones de
 * Hopcroft. Parte de la partición {F, Q∖F} y divide bloques con «divisores»
 * (C, a): un bloque se separa si algunos de sus estados van a C con a y
 * otros no. Al terminar, los estados de un mismo bloque son equivalentes.
 */
export function minimizeDfa(input: Automaton, options: MinimizeOptions = {}): MinimizationResult {
	if (!isDeterministic(input)) throw new Error('La minimización requiere un AFD.');
	const steps: AlgorithmStep[] = [];
	const { automaton: reachable, removed } = removeUnreachable(input);
	const { automaton: source, added } = completeDfa(reachable);
	const index = new AutomatonIndex(source);
	const alphabet = source.alphabet;
	const sortStates = (s: Iterable<string>): string[] => index.sort(s);

	const prepDetails: string[] = [];
	prepDetails.push(
		removed.length > 0
			? `Se eliminan los estados inalcanzables ${formatSet(removed)}.`
			: 'Todos los estados son alcanzables desde el inicial.'
	);
	prepDetails.push(
		added.length > 0
			? `El AFD es parcial: se agrega el estado sumidero ${SINK_STATE} y ${added.length} transiciones hacia él para que la función de transición sea total.`
			: 'El AFD ya es completo: cada estado tiene una transición con cada símbolo.'
	);
	steps.push({
		stage: 'minimize',
		title: 'Preparación del AFD',
		description:
			'El algoritmo trabaja sobre un AFD completo y sin estados inalcanzables, porque compara a qué bloque va cada estado con cada símbolo.',
		details: prepDetails,
		view: { kind: 'automaton', automaton: source },
		highlight: {
			states: added.length > 0 ? [SINK_STATE] : [],
			transitions: added.map((t) => t.id)
		}
	});

	// Partición inicial.
	const blocks: Block[] = [];
	const blockOf = new Map<string, Block>();
	const addBlock = (states: Iterable<string>): Block => {
		const block: Block = { id: blocks.length + 1, states: new Set(states) };
		blocks.push(block);
		for (const s of block.states) blockOf.set(s, block);
		return block;
	};
	const finals = source.states.filter((s) => index.isAccepting(s.id)).map((s) => s.id);
	const nonFinals = source.states.filter((s) => !index.isAccepting(s.id)).map((s) => s.id);
	const initial: Block[] = [];
	if (finals.length > 0) initial.push(addBlock(finals));
	if (nonFinals.length > 0) initial.push(addBlock(nonFinals));

	const name = (b: Block): string => `B${b.id}`;
	const describe = (b: Block): string => `${name(b)} = ${formatSet(sortStates(b.states))}`;
	const snapshot = (): string[][] => blocks.map((b) => sortStates(b.states));

	const waiting: [number, string][] = [];
	const inWaiting = new Set<string>();
	const pushWaiting = (blockId: number, symbol: string): void => {
		const key = `${blockId}|${symbol}`;
		if (inWaiting.has(key)) return;
		inWaiting.add(key);
		waiting.push([blockId, symbol]);
	};
	if (initial.length === 2) {
		const [a, b] = initial as [Block, Block];
		const smaller = a.states.size <= b.states.size ? a : b;
		for (const c of alphabet) pushWaiting(smaller.id, c);
	}

	steps.push({
		stage: 'minimize',
		title: 'Partición inicial',
		description:
			initial.length === 2
				? 'Los estados de aceptación y los de no aceptación son distinguibles por la cadena vacía, así que se separan en dos bloques. Se toma el bloque más pequeño como divisor con cada símbolo.'
				: 'Todos los estados son del mismo tipo (aceptación o no), así que forman un único bloque y no hay nada que dividir.',
		details: [
			...initial.map(describe),
			...(waiting.length > 0
				? [`Divisores pendientes: ${waiting.map(([b, c]) => `(B${b}, ${c})`).join(', ')}`]
				: [])
		],
		view: { kind: 'automaton', automaton: source, partition: snapshot() },
		highlight: { states: [], transitions: [] }
	});

	// Predecesores: pred[c][q] = estados p con δ(p, c) = q.
	const pred = new Map<string, Map<string, string[]>>();
	for (const t of source.transitions) {
		const symbol = t.symbol as string;
		let bySymbol = pred.get(symbol);
		if (!bySymbol) pred.set(symbol, (bySymbol = new Map()));
		const list = bySymbol.get(t.to);
		if (list) list.push(t.from);
		else bySymbol.set(t.to, [t.from]);
	}

	let quietSplitters = 0;
	while (waiting.length > 0) {
		const [splitterId, symbol] = waiting.shift() as [number, string];
		inWaiting.delete(`${splitterId}|${symbol}`);
		const splitter = blocks[splitterId - 1] as Block;
		const splitterStates = sortStates(splitter.states);
		const x = new Set<string>();
		for (const q of splitterStates) for (const p of pred.get(symbol)?.get(q) ?? []) x.add(p);

		const details: string[] = [
			`X = estados que con «${symbol}» van a ${name(splitter)} ${formatSet(splitterStates)} = ${formatSet(sortStates(x))}`
		];
		const moved: string[] = [];
		const context = new Set<string>(splitterStates);
		for (const y of [...blocks]) {
			const inside = sortStates([...y.states].filter((s) => x.has(s)));
			const outside = sortStates([...y.states].filter((s) => !x.has(s)));
			if (inside.length === 0 || outside.length === 0) continue;
			const before = describe(y);
			y.states = new Set(inside);
			const z = addBlock(outside);
			for (const c of alphabet) {
				if (inWaiting.has(`${y.id}|${c}`)) pushWaiting(z.id, c);
				else pushWaiting(inside.length <= outside.length ? y.id : z.id, c);
			}
			details.push(
				`${before} se divide: ${formatSet(inside)} van a ${name(splitter)} con «${symbol}» y ${formatSet(outside)} no. Quedan ${describe(y)} y ${describe(z)}.`
			);
			moved.push(...outside);
			for (const s of inside) context.add(s);
		}
		if (moved.length === 0) {
			quietSplitters++;
			continue;
		}
		details.push(
			`Divisores pendientes: ${waiting.length > 0 ? waiting.map(([b, c]) => `(B${b}, ${c})`).join(', ') : 'ninguno'}`
		);
		steps.push({
			stage: 'minimize',
			title: `Divisor (${name(splitter)}, ${symbol})`,
			description: `Dos estados que con «${symbol}» llegan a bloques distintos no pueden ser equivalentes: una cadena que empieza con «${symbol}» los distingue. Por eso se separan.`,
			details,
			view: { kind: 'automaton', automaton: source, partition: snapshot() },
			highlight: { states: moved, transitions: [], contextStates: [...context] }
		});
	}

	// Construcción del AFD mínimo.
	const partition = snapshot();
	const ordered = [...blocks].sort(
		(a, b) => Math.min(...[...a.states].map((s) => index.order.get(s) ?? 0)) - Math.min(...[...b.states].map((s) => index.order.get(s) ?? 0))
	);
	const startBlock = blockOf.get(source.start) as Block;
	ordered.sort((a, b) => (a === startBlock ? -1 : b === startBlock ? 1 : 0));
	const nameOf = new Map<Block, string>();
	for (const b of ordered) nameOf.set(b, sortStates(b.states).join(','));

	const states: State[] = ordered.map((b) => {
		const members = sortStates(b.states);
		const detail: State['detail'] = { mergedStates: members };
		if (members.includes(SINK_STATE)) detail.sink = true;
		return { id: nameOf.get(b) as string, detail };
	});
	let result: Automaton = {
		kind: 'mindfa',
		alphabet: [...alphabet],
		states,
		start: nameOf.get(startBlock) as string,
		accepting: ordered.filter((b) => index.isAccepting([...b.states][0] as string)).map((b) => nameOf.get(b) as string),
		transitions: []
	};
	for (const b of ordered) {
		const rep = sortStates(b.states)[0] as string;
		for (const c of alphabet) {
			const to = index.targets(rep, c)[0];
			if (to === undefined) continue;
			result.transitions.push({
				id: `t${result.transitions.length}`,
				from: nameOf.get(b) as string,
				to: nameOf.get(blockOf.get(to) as Block) as string,
				symbol: c
			});
		}
	}

	// Explicación de las fusiones.
	const merges: MergeInfo[] = ordered
		.filter((b) => b.states.size > 1)
		.map((b) => {
			const members = sortStates(b.states);
			const accepting = index.isAccepting(members[0] as string);
			return {
				state: nameOf.get(b) as string,
				members,
				reasons: [
					`Todos son ${accepting ? 'de aceptación' : 'de no aceptación'}.`,
					...alphabet.map((c) => {
						const target = blockOf.get(index.targets(members[0] as string, c)[0] as string) as Block;
						const moves = members.map((m) => `${m}→${index.targets(m, c)[0]}`).join(', ');
						return `Con «${c}»: ${moves}; todos llegan al bloque ${formatSet(sortStates(target.states))}.`;
					}),
					'Ningún divisor logró separarlos, así que ninguna cadena los distingue: son equivalentes.'
				]
			};
		});

	// Estado sumidero: se omite salvo que se pida el AFD completo.
	let sinkRemoved = false;
	const dead = deadStates(result);
	if (!options.keepSink && dead.length > 0) {
		const deadSet = new Set(dead);
		sinkRemoved = true;
		if (deadSet.has(result.start)) {
			// Lenguaje vacío: queda solo el estado inicial, sin transiciones
			// (y sin el sumidero entre sus miembros).
			const startState = result.states.find((s) => s.id === result.start) as State;
			const members = (startState.detail?.mergedStates ?? []).filter((m) => m !== SINK_STATE);
			const id = members.length > 0 ? members.join(',') : result.start;
			result = {
				...result,
				start: id,
				states: [{ id, detail: { mergedStates: members } }],
				transitions: []
			};
			for (const m of merges) if (m.state === startState.id) m.state = id;
		} else {
			result = {
				...result,
				states: result.states.filter((s) => !deadSet.has(s.id)),
				transitions: result.transitions.filter((t) => !deadSet.has(t.from) && !deadSet.has(t.to))
			};
		}
		result.transitions = result.transitions.map((t, i) => ({ ...t, id: `t${i}` }));
	}

	const finalDetails = [
		`Partición estable: ${partition.map((p) => formatSet(p)).join(' · ')}`,
		`${source.states.length} → ${result.states.length} estados.`
	];
	if (quietSplitters > 0) finalDetails.push(`${quietSplitters} divisor(es) revisado(s) no separaron ningún bloque.`);
	if (sinkRemoved) {
		finalDetails.push(
			'El bloque muerto (no final, sin camino a un estado final) se omite del diagrama: el AFD mínimo se muestra parcial. Activa «Mostrar estado sumidero» para verlo completo.'
		);
	}
	steps.push({
		stage: 'minimize',
		title: 'AFD mínimo',
		description:
			merges.length > 0
				? `Cada bloque se convierte en un estado. Se fusionaron: ${merges.map((m) => formatSet(m.members)).join(', ')}.`
				: 'Cada bloque contiene un solo estado: el AFD ya era mínimo (salvo, en su caso, el sumidero).',
		details: finalDetails,
		view: { kind: 'automaton', automaton: result },
		highlight: { states: merges.map((m) => m.state).filter((s) => result.states.some((x) => x.id === s)), transitions: [] }
	});

	return { automaton: result, steps, source, partition, merges, removedUnreachable: removed, sinkRemoved };
}
