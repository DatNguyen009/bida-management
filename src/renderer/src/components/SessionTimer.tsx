import { useEffect, useState } from 'react'
import { elapsedMinutes, formatDuration, calcPlayAmount, formatCurrency } from '../lib/utils'

interface Props {
  startTime: string
  hourlyRate: number
}

export default function SessionTimer({ startTime, hourlyRate }: Props) {
  const [minutes, setMinutes] = useState(() => elapsedMinutes(startTime))

  useEffect(() => {
    const timer = setInterval(() => {
      setMinutes(elapsedMinutes(startTime))
    }, 60000)
    return () => clearInterval(timer)
  }, [startTime])

  const amount = calcPlayAmount(minutes, hourlyRate)

  return (
    <div className="text-center">
      <p className="text-lg font-mono text-yellow-400">{formatDuration(minutes)}</p>
      <p className="text-sm text-green-400">{formatCurrency(amount)}</p>
    </div>
  )
}
