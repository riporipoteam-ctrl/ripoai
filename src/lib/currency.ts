// Free currency conversion via Frankfurter (ECB data, no key, open CORS).

const NAMES: Record<string, string> = {
  usd: 'USD', dollar: 'USD', dollars: 'USD', buck: 'USD', bucks: 'USD',
  eur: 'EUR', euro: 'EUR', euros: 'EUR',
  gbp: 'GBP', pound: 'GBP', pounds: 'GBP', sterling: 'GBP', quid: 'GBP',
  jpy: 'JPY', yen: 'JPY',
  inr: 'INR', rupee: 'INR', rupees: 'INR',
  cad: 'CAD', aud: 'AUD', nzd: 'NZD',
  chf: 'CHF', franc: 'CHF',
  cny: 'CNY', yuan: 'CNY', rmb: 'CNY',
  krw: 'KRW', won: 'KRW',
  mxn: 'MXN', peso: 'MXN', pesos: 'MXN',
  brl: 'BRL', real: 'BRL',
  rub: 'RUB', ruble: 'RUB',
  try: 'TRY', lira: 'TRY',
  zar: 'ZAR', rand: 'ZAR',
  sek: 'SEK', nok: 'NOK', dkk: 'DKK', pln: 'PLN', sgd: 'SGD', hkd: 'HKD', aed: 'AED',
}

function codesIn(text: string): string[] {
  const out: string[] = []
  const re = new RegExp(`\\b(${Object.keys(NAMES).join('|')})\\b`, 'gi')
  let m
  while ((m = re.exec(text))) {
    const code = NAMES[m[1].toLowerCase()]
    if (code && out[out.length - 1] !== code) out.push(code)
  }
  return out
}

export function wantsCurrency(text: string): boolean {
  const codes = codesIn(text)
  if (/\bexchange rate\b/i.test(text) && codes.length >= 1) return true
  return /\b(convert|in|to|=|worth|equals?)\b/i.test(text) && codes.length >= 2 && /\d/.test(text)
}

export async function convertCurrency(text: string): Promise<string> {
  try {
    const codes = codesIn(text)
    if (codes.length < 2) return ''
    const [from, to] = codes
    const amtMatch = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
    const amount = amtMatch ? parseFloat(amtMatch[1]) : 1
    const r = await fetch(`https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`)
    const d = await r.json()
    const val = d?.rates?.[to]
    if (val == null) return ''
    return `${amount.toLocaleString()} ${from} = ${val.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to} (rate ${(val / amount).toFixed(4)}, ECB ${d.date})`
  } catch {
    return ''
  }
}
