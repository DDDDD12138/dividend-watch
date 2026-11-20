import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { sameChartMeasurements, type ChartMeasurements } from './chartViewport'

export function useChartViewState() {
  const [expanded, setExpanded] = useState(false)
  const year = useRef<number | null>(null)
  const [measurements, setMeasurements] = useState<
    ReadonlyMap<string, ChartMeasurements>
  >(new Map())
  const getYear = useCallback(() => year.current, [])
  const setYear = useCallback((value: number) => {
    year.current = value
  }, [])
  const report = useCallback((key: string, next: ChartMeasurements) => {
    setMeasurements((previous) =>
      sameChartMeasurements(previous.get(key) ?? null, next)
        ? previous
        : new Map(previous).set(key, next),
    )
  }, [])
  return useMemo(
    () => ({ expanded, setExpanded, getYear, setYear, measurements, report }),
    [expanded, getYear, setYear, measurements, report],
  )
}

export const SharedViewContext = createContext<ReturnType<
  typeof useChartViewState
> | null>(null)

interface PlotViewport {
  width: number
  report: (measurements: ChartMeasurements) => void
  axisTarget: HTMLDivElement | null
  scrolling: boolean
}
export const PlotViewportContext = createContext<PlotViewport>({
  width: 0,
  report: () => {},
  axisTarget: null,
  scrolling: false,
})
export function usePlotViewport() {
  return useContext(PlotViewportContext)
}
