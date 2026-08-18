// owner: finn
// goal: the four numbers at the top, and where each one opens

import { Kpi, Kpis } from "./kpi.tsx"
import { Section } from "../../atoms/section.tsx"
import { num, pct, plural, tokens } from "../../../lib/say/format.ts"
import { commentsOf, contextOf, historyOf, sizeOf } from "../../../lib/say/verdict.ts"
import type { Stats } from "../../../../src/read/model.ts"

interface Props {
  stats: Stats
  /** every commit there is, which a truncated read does not have */
  total: number
  /** the days the history spans */
  span: number
  onCard: (to: string, shade?: string) => void
}

export function Headline({ stats, total, span, onCard }: Props) {
  const source = stats.code + stats.comment
  return (
    <Section id="kpis_overview">
      <Kpis>
        {[
          {
            label: "Lines of code",
            value: num(stats.code),
            sub: `${num(stats.files)} files${stats.stack.primary ? `, primarily ${stats.stack.primary}` : ""}`,
            verdict: sizeOf(stats.code),
            to: "Files",
            shade: "Code",
          },
          {
            label: "Comments",
            value: num(stats.comment),
            sub: `${pct(stats.comment, source)} of source`,
            verdict: commentsOf(stats.comment, source),
            to: "Files",
            shade: "Comments",
          },
          {
            label: "Tokens",
            value: `~${num(tokens(stats.chars))}`,
            sub: `${num(stats.chars)} chars`,
            verdict: contextOf(tokens(stats.chars)),
            to: "Files",
          },
          {
            label: "Commits",
            value: num(total),
            sub: stats.truncated
              ? `${plural(stats.contributors.length, "dev")} in the latest ${num(stats.commits)}`
              : `${plural(stats.contributors.length, "dev")} in ${plural(span, "day")}`,
            verdict: historyOf(total),
            to: "History",
          },
        ].map(({ shade, ...card }) => (
          <Kpi key={card.label} {...card} opens={card.to} onClick={() => onCard(card.to, shade)} />
        ))}
      </Kpis>{" "}
    </Section>
  )
}
