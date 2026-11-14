import type { Block } from "@/lib/data"

export function BlockView({ block: b }: { block: Block }) {
  switch (b.t) {
    case "h": return <h3 className="blk-h">{b.x}</h3>
    case "sh": return <h4 className="blk-sh">{b.x}</h4>
    case "p": return <p className="blk-p">{b.x}</p>
    case "ar": return <p className="blk-ar">{b.x}</p>
    case "ur": return <p className="blk-ur">{b.x}</p>
    case "note": return <p className="blk-note">{b.x}</p>
    case "verse":
      return (
        <figure className="blk-verse">
          <div className="kind">{b.kind} · {b.ref}</div>
          <p className="blk-ar mb-0!">{b.ar}</p>
          <p className="blk-ur my-0!">{b.ur}</p>
          <p className="blk-p c-muted mb-0!">{b.en}</p>
        </figure>
      )
    case "table":
      return (
        <div className="my-5 overflow-x-auto">
          <table className="blk-table">
            <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
  }
}
