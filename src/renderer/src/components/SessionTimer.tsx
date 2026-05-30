import { useEffect, useState } from 'react'
import { elapsedSeconds, formatDuration, calcPlayAmount, formatCurrency } from '../lib/utils'

interface Props {
  startTime: string
  hourlyRate: number
}

export default function SessionTimer({ startTime, hourlyRate }: Props) {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(startTime))

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(elapsedSeconds(startTime))
    }, 1000)
    return () => clearInterval(timer)
  }, [startTime])

  const amount = calcPlayAmount(seconds / 60, hourlyRate)

  return (
    <div className="text-center">
      <p className="text-lg font-mono text-yellow-400">{formatDuration(seconds)}</p>
      <p className="text-sm text-green-400">{formatCurrency(amount)}</p>
    </div>
  )
}
