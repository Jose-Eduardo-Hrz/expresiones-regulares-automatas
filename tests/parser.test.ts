import { describe, expect, it } from 'vitest';
import { alphabetOf, toRegexString, type RegexNode } from '../src/lib/regex/ast';
import { MAX_REGEX_LENGTH, RegexSyntaxError, parseRegex, tokenize, tryParseRegex } from '../src/lib/regex/parser';

/** Representación compacta de la estructura, sin ids ni intervalos. */
function shape(n: RegexNode): string {
	switch (n.kind) {
		case 'symbol':
			return n.value;
		case 'epsilon':
			return 'ε';
		case 'empty':
			return '∅';
		case 'union':
			return `U(${shape(n.left)},${shape(n.right)})`;
		case 'concat':
			return `C(${shape(n.left)},${shape(n.right)})`;
		case 'star':
			return `S(${shape(n.child)})`;
	}
}

function errorOf(src: string): RegexSyntaxError {
	const r = tryParseRegex(src);
	if (r.ok) throw new Error(`Se esperaba un error para «${src}»`);
	return r.error;
}

describe('precedencia y asociatividad', () => {
	it('la cerradura liga más fuerte que la concatenación, y esta más que la unión', () => {
		expect(shape(parseRegex('a+bc*'))).toBe('U(a,C(b,S(c)))');
		expect(shape(parseRegex('ab*'))).toBe('C(a,S(b))');
		expect(shape(parseRegex('(ab)*'))).toBe('S(C(a,b))');
		expect(shape(parseRegex('a+b*'))).toBe('U(a,S(b))');
	});

	it('unión y concatenación asocian por la izquierda', () => {
		expect(shape(parseRegex('a+b+c'))).toBe('U(U(a,b),c)');
		expect(shape(parseRegex('abc'))).toBe('C(C(a,b),c)');
		expect(shape(parseRegex('a+(b+c)'))).toBe('U(a,U(b,c))');
	});

	it('los paréntesis agrupan', () => {
		expect(shape(parseRegex('(a+b)c'))).toBe('C(U(a,b),c)');
		expect(shape(parseRegex('a(b+c)'))).toBe('C(a,U(b,c))');
		expect(shape(parseRegex('((a))'))).toBe('a');
		expect(shape(parseRegex('((a+b)*(c))*'))).toBe('S(C(S(U(a,b)),c))');
	});

	it('acepta cerraduras repetidas', () => {
		expect(shape(parseRegex('a**'))).toBe('S(S(a))');
	});

	it('acepta | como unión y la expresión de Thompson completa', () => {
		expect(shape(parseRegex('a|b'))).toBe('U(a,b)');
		expect(shape(parseRegex('(a|b)*abb'))).toBe('C(C(C(S(U(a,b)),a),b),b)');
	});
});

describe('ε, ∅ y notación ASCII', () => {
	it('distingue ε de ∅', () => {
		expect(parseRegex('ε').kind).toBe('epsilon');
		expect(parseRegex('∅').kind).toBe('empty');
	});

	it('reconoce eps, empty y alias', () => {
		expect(shape(parseRegex('a eps'))).toBe('C(a,ε)');
		expect(shape(parseRegex('a+empty'))).toBe('U(a,∅)');
		expect(parseRegex('λ').kind).toBe('epsilon');
		expect(parseRegex('Ø').kind).toBe('empty');
	});

	it('los espacios separan símbolos que formarían una palabra reservada', () => {
		expect(shape(parseRegex('e p s'))).toBe('C(C(e,p),s)');
		expect(shape(parseRegex('eps'))).toBe('ε');
	});

	it('detecta el alfabeto', () => {
		expect(alphabetOf(parseRegex('(b+a)*c1'))).toEqual(['1', 'a', 'b', 'c']);
		expect(alphabetOf(parseRegex('ε+∅'))).toEqual([]);
	});
});

describe('impresión canónica', () => {
	it('reconstruye una expresión equivalente con el mínimo de paréntesis', () => {
		for (const src of ['a+bc*', '(a+b)*abb', 'a(b+c)', 'a+(b+c)', 'a(bc)', '(a*)*', '((a(b+ε))*c)*', 'a+∅']) {
			const ast = parseRegex(src);
			expect(shape(parseRegex(toRegexString(ast)))).toBe(shape(ast));
		}
		expect(toRegexString(parseRegex('((a))+((b)c)'))).toBe('a+bc');
		expect(toRegexString(parseRegex('a(bc)'))).toBe('a(bc)');
	});
});

describe('errores de sintaxis', () => {
	it('paréntesis sin cerrar o sin abrir', () => {
		expect(errorOf('(a+b').message).toMatch(/sin cerrar/);
		expect(errorOf('(a+b').position).toBe(0);
		expect(errorOf('a)').message).toMatch(/sin «\(»/);
		expect(errorOf('a)').position).toBe(1);
		expect(errorOf('((a)').message).toMatch(/sin cerrar/);
		expect(errorOf('a(').message).toMatch(/sin cerrar/);
	});

	it('operandos ausentes', () => {
		expect(errorOf('+a').message).toMatch(/operando izquierdo/);
		expect(errorOf('a+').message).toMatch(/operando derecho/);
		expect(errorOf('*a').message).toMatch(/sin operando/);
		expect(errorOf('(+a)').message).toMatch(/operando izquierdo/);
		expect(errorOf('a+*').message).toMatch(/operando derecho/);
		expect(errorOf('()').message).toMatch(/vacíos/);
	});

	it('operadores consecutivos inválidos', () => {
		expect(errorOf('a++b').message).toMatch(/consecutivos/);
		expect(errorOf('a|+b').message).toMatch(/consecutivos/);
	});

	it('símbolos no permitidos con sugerencias específicas', () => {
		const e = errorOf('ab?');
		expect(e.message).toMatch(/no permitido «\?»/);
		expect(e.position).toBe(2);
		expect(e.hint).toMatch(/r\+ε/);
		expect(errorOf('a.b').hint).toMatch(/implícita/);
		expect(errorOf('a-b').message).toMatch(/no permitido/);
	});

	it('expresión vacía y demasiado larga', () => {
		expect(errorOf('').message).toMatch(/vacía/);
		expect(errorOf('   ').message).toMatch(/vacía/);
		expect(errorOf('a'.repeat(MAX_REGEX_LENGTH + 1)).message).toMatch(/máximo/);
		expect(tryParseRegex('a'.repeat(MAX_REGEX_LENGTH)).ok).toBe(true);
	});

	it('el tokenizador conserva las posiciones originales', () => {
		const tokens = tokenize(' a | eps ');
		expect(tokens.map((t) => [t.type, t.pos])).toEqual([
			['symbol', 1],
			['union', 3],
			['epsilon', 5]
		]);
	});
});
