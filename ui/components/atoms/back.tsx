// owner: finn
// goal: returning

export function Back({ onTab }: { onTab: (tab: string) => void }) {
  return (
    <button
      data-print="hide"
      onClick={() => onTab("Overview")}
      title="Back to the summary"
      className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs"
    >
      ← Overview
    </button>
  )
}
