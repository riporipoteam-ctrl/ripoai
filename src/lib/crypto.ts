// Free crypto prices via CoinGecko (no key, open CORS).

const MAP: Record<string, string> = {
  btc: 'bitcoin', bitcoin: 'bitcoin',
  eth: 'ethereum', ethereum: 'ethereum',
  doge: 'dogecoin', dogecoin: 'dogecoin',
  sol: 'solana', solana: 'solana',
  ada: 'cardano', cardano: 'cardano',
  xrp: 'ripple', ripple: 'ripple',
  ltc: 'litecoin', litecoin: 'litecoin',
  bnb: 'binancecoin',
  dot: 'polkadot', polkadot: 'polkadot',
  matic: 'matic-network',
  shib: 'shiba-inu',
  avax: 'avalanche-2',
  link: 'chainlink', chainlink: 'chainlink',
}

export function wantsCrypto(text: string): boolean {
  const coin = new RegExp(`\\b(${Object.keys(MAP).join('|')}|crypto|coin|token)\\b`, 'i')
  return coin.test(text) && /\b(price|worth|cost|value|how much|trading|chart|usd)\b/i.test(text)
}

export async function getCryptoInfo(text: string): Promise<string> {
  try {
    let id: string | undefined
    const m = text.toLowerCase().match(new RegExp(`\\b(${Object.keys(MAP).join('|')})\\b`, 'i'))
    if (m) id = MAP[m[1].toLowerCase()]
    if (!id) {
      const term = text.replace(/\b(price|worth|cost|value|how much is|of|the|crypto|coin|token|usd)\b/gi, ' ').trim()
      const s = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(term)}`)
      const sd = await s.json()
      id = sd?.coins?.[0]?.id
    }
    if (!id) return ''
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`,
    )
    const d = await r.json()
    const p = d[id]
    if (!p) return ''
    const chg = typeof p.usd_24h_change === 'number' ? `${p.usd_24h_change >= 0 ? '+' : ''}${p.usd_24h_change.toFixed(2)}% (24h)` : ''
    return `${id}: $${p.usd.toLocaleString()} ${chg}`
  } catch {
    return ''
  }
}
