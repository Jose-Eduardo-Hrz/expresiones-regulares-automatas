import type { RegexNode, Span } from './ast';

/** Longitud máxima de la expresión (en caracteres, sin contar espacios). */
export const MAX_REGEX_LENGTH = 100;

export type TokenType = 'symbol' | 'epsilon' | 'empty' | 'union' | 'star' | 'lparen' | 'rparen';

export interface Token {
	type: TokenType;
	/** Texto original del token (por ejemplo «eps» o «|»). */
	text: string;
	/** Valor normalizado: el símbolo, «ε», «∅», «+», «*», «(» o «)». */
	value: string;
	pos: number;
	length: number;
}

/** Error de sintaxis con la posición del problema y una sugerencia para corregirlo. */
export class RegexSyntaxError extends Error {
	readonly position: number;
	readonly length: number;
	readonly hint: string;

	constructor(message: string, position: number, length: number, hint: string) {
		super(message);
		this.name = 'RegexSyntaxError';
		this.position = position;
		this.length = length;
		this.hint = hint;
	}
}

/** Caracteres válidos como símbolos del alfabeto. */
export const SYMBOL_PATTERN = /^[A-Za-z0-9]$/;

const SINGLE_CHAR_TOKENS: Record<string, { type: TokenType; value: string }> = {
	'ε': { type: 'epsilon', value: 'ε' },
	'λ': { type: 'epsilon', value: 'ε' },
	'∅': { type: 'empty', value: '∅' },
	'Ø': { type: 'empty', value: '∅' },
	'ø': { type: 'empty', value: '∅' },
	'+': { type: 'union', value: '+' },
	'|': { type: 'union', value: '+' },
	'∪': { type: 'union', value: '+' },
	'*': { type: 'star', value: '*' },
	'(': { type: 'lparen', value: '(' },
	')': { type: 'rparen', value: ')' }
};

/** Palabras reservadas ASCII; se reconocen antes que los símbolos individuales. */
const KEYWORDS: { word: string; type: TokenType; value: string }[] = [
	{ word: 'empty', type: 'empty', value: '∅' },
	{ word: 'eps', type: 'epsilon', value: 'ε' }
];

const HINTS_FOR_CHAR: Record<string, string> = {
	'?': 'El operador «?» no forma parte de la sintaxis: escribe (r+ε) en lugar de r?.',
	'.': 'La concatenación es implícita: escribe ab en lugar de a.b.',
	'·': 'La concatenación es implícita: escribe ab en lugar de a·b.',
	'[': 'Las clases de caracteres no están permitidas: escribe (a+b+c) en lugar de [abc].',
	']': 'Las clases de caracteres no están permitidas: escribe (a+b+c) en lugar de [abc].',
	'{': 'Las repeticiones con llaves no están permitidas: escribe aaa en lugar de a{3}.',
	'}': 'Las repeticiones con llaves no están permitidas: escribe aaa en lugar de a{3}.',
	'^': 'No se usan anclas: la expresión describe siempre la cadena completa.',
	'$': 'No se usan anclas: la expresión describe siempre la cadena completa.',
	'#': 'El símbolo # está reservado como marcador de fin del método directo.'
};

const GENERIC_HINT =
	'Usa símbolos a–z, A–Z o 0–9, ε (o eps), ∅ (o empty), +, |, *, ( y ).';

export function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let significant = 0;
	let i = 0;
	while (i < source.length) {
		const ch = source[i] as string;
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		significant++;
		if (significant > MAX_REGEX_LENGTH) {
			throw new RegexSyntaxError(
				`La expresión supera el máximo de ${MAX_REGEX_LENGTH} caracteres`,
				i,
				source.length - i,
				'Divide el problema en expresiones más cortas para mantener el autómata legible.'
			);
		}
		const keyword = KEYWORDS.find((k) => source.startsWith(k.word, i));
		if (keyword) {
			tokens.push({ type: keyword.type, text: keyword.word, value: keyword.value, pos: i, length: keyword.word.length });
			i += keyword.word.length;
			continue;
		}
		const single = SINGLE_CHAR_TOKENS[ch];
		if (single) {
			tokens.push({ ...single, text: ch, pos: i, length: 1 });
		} else if (SYMBOL_PATTERN.test(ch)) {
			tokens.push({ type: 'symbol', text: ch, value: ch, pos: i, length: 1 });
		} else {
			throw new RegexSyntaxError(
				`Símbolo no permitido «${ch}» en la posición ${i + 1}`,
				i,
				1,
				HINTS_FOR_CHAR[ch] ?? GENERIC_HINT
			);
		}
		i++;
	}
	return tokens;
}

const ATOM_START: ReadonlySet<TokenType> = new Set(['symbol', 'epsilon', 'empty', 'lparen']);

class Parser {
	private index = 0;
	private nextId = 0;
	private readonly tokens: Token[];
	private readonly sourceLength: number;

	constructor(tokens: Token[], sourceLength: number) {
		this.tokens = tokens;
		this.sourceLength = sourceLength;
	}

	parse(): RegexNode {
		if (this.tokens.length === 0) {
			throw new RegexSyntaxError(
				'La expresión está vacía',
				0,
				0,
				'Escribe una expresión, por ejemplo (a+b)*abb. Para la cadena vacía usa ε y para el lenguaje vacío ∅.'
			);
		}
		const node = this.union();
		const rest = this.peek();
		if (rest) {
			if (rest.type === 'rparen') {
				throw new RegexSyntaxError(
					`Paréntesis «)» sin «(» correspondiente en la posición ${rest.pos + 1}`,
					rest.pos,
					1,
					'Elimina este paréntesis o agrega el «(» que le falta.'
				);
			}
			throw this.unexpected(rest);
		}
		return node;
	}

	private peek(): Token | undefined {
		return this.tokens[this.index];
	}

	private previous(): Token | undefined {
		return this.tokens[this.index - 1];
	}

	private advance(): Token {
		const t = this.tokens[this.index];
		if (!t) throw new Error('Fin inesperado de los tokens');
		this.index++;
		return t;
	}

	private span(start: number, end: number): Span {
		return { start, end };
	}

	private union(): RegexNode {
		let left = this.concat();
		while (this.peek()?.type === 'union') {
			const op = this.advance();
			const next = this.peek();
			if (!next || !ATOM_START.has(next.type)) {
				const detail =
					next?.type === 'union'
						? `Hay dos operadores de unión consecutivos («${op.text}${next.text}»)`
						: `Falta el operando derecho de «${op.text}» (posición ${op.pos + 1})`;
				throw new RegexSyntaxError(
					detail,
					op.pos,
					next && next.type === 'union' ? next.pos + next.length - op.pos : 1,
					'Escribe una expresión a cada lado de la unión, por ejemplo a+b. Si quieres incluir la cadena vacía usa a+ε.'
				);
			}
			const right = this.concat();
			left = {
				kind: 'union',
				left,
				right,
				id: this.nextId++,
				span: this.span(left.span.start, right.span.end)
			};
		}
		return left;
	}

	private concat(): RegexNode {
		const next = this.peek();
		if (!next || !ATOM_START.has(next.type)) throw this.missingOperand(next);
		let left = this.star();
		while (true) {
			const t = this.peek();
			if (!t || !ATOM_START.has(t.type)) break;
			const right = this.star();
			left = {
				kind: 'concat',
				left,
				right,
				id: this.nextId++,
				span: this.span(left.span.start, right.span.end)
			};
		}
		return left;
	}

	private star(): RegexNode {
		let node = this.atom();
		while (this.peek()?.type === 'star') {
			const op = this.advance();
			node = { kind: 'star', child: node, id: this.nextId++, span: this.span(node.span.start, op.pos + 1) };
		}
		return node;
	}

	private atom(): RegexNode {
		const t = this.advance();
		const span = this.span(t.pos, t.pos + t.length);
		switch (t.type) {
			case 'symbol':
				return { kind: 'symbol', value: t.value, id: this.nextId++, span };
			case 'epsilon':
				return { kind: 'epsilon', id: this.nextId++, span };
			case 'empty':
				return { kind: 'empty', id: this.nextId++, span };
			case 'lparen': {
				const next = this.peek();
				if (!next) throw this.unclosed(t);
				if (next.type === 'rparen') {
					throw new RegexSyntaxError(
						`Paréntesis vacíos «()» en la posición ${t.pos + 1}`,
						t.pos,
						next.pos + 1 - t.pos,
						'Un grupo debe contener una expresión. Para la cadena vacía escribe ε en su lugar.'
					);
				}
				const inner = this.union();
				const close = this.peek();
				if (!close || close.type !== 'rparen') throw this.unclosed(t);
				this.advance();
				// El intervalo del grupo incluye sus paréntesis.
				inner.span = this.span(t.pos, close.pos + 1);
				return inner;
			}
			default:
				throw this.unexpected(t);
		}
	}

	private missingOperand(next: Token | undefined): RegexSyntaxError {
		const prev = this.previous();
		if (!next) {
			const pos = prev ? prev.pos + prev.length : this.sourceLength;
			return new RegexSyntaxError(
				'Falta un operando al final de la expresión',
				Math.max(0, pos - 1),
				1,
				'Completa la expresión con un símbolo o un grupo entre paréntesis.'
			);
		}
		switch (next.type) {
			case 'union':
				return new RegexSyntaxError(
					`Falta el operando izquierdo de «${next.text}» (posición ${next.pos + 1})`,
					next.pos,
					1,
					'La unión necesita una expresión a cada lado, por ejemplo a+b. Para «ε o b» escribe ε+b.'
				);
			case 'star':
				return new RegexSyntaxError(
					`«*» sin operando en la posición ${next.pos + 1}`,
					next.pos,
					1,
					'La cerradura de Kleene se escribe después de un símbolo o de un grupo, por ejemplo a* o (ab)*.'
				);
			case 'rparen':
				return new RegexSyntaxError(
					`Falta un operando antes de «)» (posición ${next.pos + 1})`,
					next.pos,
					1,
					'Completa la expresión dentro del grupo antes de cerrarlo.'
				);
			default:
				return this.unexpected(next);
		}
	}

	private unclosed(open: Token): RegexSyntaxError {
		return new RegexSyntaxError(
			`Paréntesis «(» sin cerrar (abierto en la posición ${open.pos + 1})`,
			open.pos,
			1,
			'Agrega el «)» que le corresponde al final del grupo.'
		);
	}

	private unexpected(t: Token): RegexSyntaxError {
		return new RegexSyntaxError(
			`Símbolo inesperado «${t.text}» en la posición ${t.pos + 1}`,
			t.pos,
			t.length,
			GENERIC_HINT
		);
	}
}

/**
 * Analiza la expresión y devuelve su árbol sintáctico.
 * Lanza {@link RegexSyntaxError} si la expresión no es válida.
 */
export function parseRegex(source: string): RegexNode {
	return new Parser(tokenize(source), source.length).parse();
}

export type ParseOutcome =
	| { ok: true; ast: RegexNode }
	| { ok: false; error: RegexSyntaxError };

/** Versión de {@link parseRegex} que no lanza excepciones. */
export function tryParseRegex(source: string): ParseOutcome {
	try {
		return { ok: true, ast: parseRegex(source) };
	} catch (e) {
		if (e instanceof RegexSyntaxError) return { ok: false, error: e };
		throw e;
	}
}
