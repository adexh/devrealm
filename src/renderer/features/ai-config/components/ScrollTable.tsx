import React, { useLayoutEffect, useRef, useState } from 'react'
import { Mono } from '../../../components/ui'

export function ScrollTable({ columns, head, children, count, bodyClassName = 'overflow-y-auto overflow-x-hidden max-h-52' }: {
  columns: string[]
  head: React.ReactNode
  children: React.ReactNode
  count: number
  /** The scrolling body's full class list, so its height stays a static utility. */
  bodyClassName?: string
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ overflowing: false, scrollbarWidth: 0 })

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body?.firstElementChild) return
    const observer = new ResizeObserver(() => setScroll({
      overflowing: body.scrollHeight > body.clientHeight,
      scrollbarWidth: body.offsetWidth - body.clientWidth,
    }))
    observer.observe(body)
    observer.observe(body.firstElementChild)
    return () => observer.disconnect()
  }, [])

  const colgroup = <colgroup>{columns.map((width, i) => <col key={i} className={width} />)}</colgroup>
  return (
    <div className="border border-t-line rounded overflow-hidden">
      <div className="border-b border-t-line bg-t-panel" style={{ paddingRight: scroll.scrollbarWidth }}>
        <table className="w-full table-fixed text-[11px] border-collapse">{colgroup}<thead>{head}</thead></table>
      </div>
      <div ref={bodyRef} className={bodyClassName}>
        <table className="w-full table-fixed text-[11px] border-collapse">{colgroup}<tbody>{children}</tbody></table>
      </div>
      {scroll.overflowing && (
        <div className="px-2.5 py-1 border-t border-t-line bg-t-panel">
          <Mono size={10} soft>{count} items · scroll to see all</Mono>
        </div>
      )}
    </div>
  )
}
