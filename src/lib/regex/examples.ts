export interface RegexExample {
	regex: string;
	title: string;
	description: string;
}

/** Ejemplos precargados, de los más simples a los más elaborados. */
export const EXAMPLES: RegexExample[] = [
	{ regex: 'a', title: 'Un símbolo', description: 'Solo la cadena «a».' },
	{ regex: 'ab', title: 'Concatenación', description: 'Solo la cadena «ab».' },
	{ regex: 'a+b', title: 'Unión', description: '«a» o «b».' },
	{ regex: 'a*', title: 'Cerradura', description: 'Cualquier cantidad de aes, incluida ninguna.' },
	{ regex: 'a(b+c)', title: 'Concatenación con grupo', description: '«ab» o «ac».' },
	{ regex: '(a+b)*', title: 'Cerradura de una unión', description: 'Todas las cadenas sobre {a, b}.' },
	{ regex: '(a+b)*abb', title: 'Termina en abb', description: 'El ejemplo clásico del libro del dragón.' },
	{ regex: '(0+1)*1(0+1)', title: 'Penúltimo símbolo 1', description: 'Cadenas binarias cuyo penúltimo símbolo es 1.' },
	{ regex: '(01+10)*', title: 'Pares alternados', description: 'Concatenaciones de «01» y «10».' },
	{ regex: '1*(01*01*)*', title: 'Cantidad par de ceros', description: 'Cadenas binarias con un número par de ceros.' },
	{ regex: '(a+b)*a(a+b)(a+b)', title: 'Tercero desde el final', description: 'El AFD crece de forma exponencial con la distancia al final.' },
	{ regex: '((a+b)(a+b))*', title: 'Longitud par', description: 'Cadenas sobre {a, b} de longitud par.' },
	{ regex: 'ε', title: 'Cadena vacía', description: 'El lenguaje {ε}.' },
	{ regex: '∅', title: 'Lenguaje vacío', description: 'No acepta ninguna cadena.' },
	{ regex: 'aε', title: 'Concatenación con ε', description: 'Equivale a «a».' },
	{ regex: 'a+∅', title: 'Unión con ∅', description: 'Equivale a «a».' },
	{ regex: '((a(b+ε))*c)*', title: 'Paréntesis anidados', description: 'Varios niveles de agrupación y cerraduras.' }
];
