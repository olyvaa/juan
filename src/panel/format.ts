// Formato de importes y colores de resultado.
// Formato español con separador de miles siempre (es-ES no agrupa los números de 4 cifras).
const amount = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usd = (n: number) => `${n < 0 ? '−' : ''}${amount.format(Math.abs(n))} $`;
export const signedUsd = (n: number) => (n > 0 ? '+' : '') + usd(n);
export const tone = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
