import { weatherEmoji, weatherText, type WeatherData } from '../lib/weather'

export default function WeatherCard({ data }: { data: WeatherData }) {
  const day = (d: string) => new Date(d).toLocaleDateString(undefined, { weekday: 'short' })
  return (
    <div className="my-2 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-accent/20 to-transparent">
      <div className="flex items-center gap-3 p-4">
        <div className="text-5xl leading-none">{weatherEmoji(data.current.code)}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-muted">{data.place}</div>
          <div className="text-3xl font-bold">{data.current.temp}°</div>
          <div className="text-xs text-muted">{weatherText(data.current.code)} · 💧{data.current.humidity}% · 💨{data.current.wind}km/h</div>
        </div>
      </div>
      <div className="flex gap-1 border-t border-white/10 p-2">
        {data.daily.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-center">
            <span className="text-[11px] text-muted">{day(d.date)}</span>
            <span className="text-lg">{weatherEmoji(d.code)}</span>
            <span className="text-[11px] font-semibold">{d.max}°</span>
            <span className="text-[11px] text-muted">{d.min}°</span>
          </div>
        ))}
      </div>
    </div>
  )
}
