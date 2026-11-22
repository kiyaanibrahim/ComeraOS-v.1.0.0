"use client"

import { createContext, useContext } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

import type { FlowTone, SetupAction } from "@/components/setup/model"
import { cn } from "cn"

export type SetupNodeData = {
  nodeId: string
  title: string
  subtitle?: string
  tone: FlowTone
  disabled?: boolean
  reason?: string
  action: SetupAction
  selected: boolean
}

export type SetupFlowNode = Node<SetupNodeData, "setup">

export const SetupClickContext = createContext<(data: SetupNodeData) => void>(() => {})

const tones: Record<FlowTone, string> = {
  neutral: "border-transparent bg-muted text-foreground",
  industry: "border-transparent bg-violet-600 text-white",
  flow: "border-transparent bg-blue-600 text-white",
  action: "border-dashed border-blue-600 bg-background text-blue-700",
  owner: "border-transparent bg-muted text-foreground",
  staff: "border-transparent bg-orange-500 text-white",
  subordinate: "border-transparent bg-emerald-600 text-white",
  muted: "border-dashed border-border bg-muted text-muted-foreground",
}

export function SetupNode({ data }: NodeProps<SetupFlowNode>) {
  const onClick = useContext(SetupClickContext)
  return (
    <button
      type="button"
      disabled={data.disabled}
      title={data.reason}
      onClick={() => onClick(data)}
      className={cn(
        "pointer-events-auto flex h-full w-full flex-col items-center justify-center rounded-lg border px-3 py-2 text-center shadow-sm",
        tones[data.tone],
        data.selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        data.disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <Handle id="in" type="target" position={Position.Top} className="opacity-0" />
      <Handle id="side-in" type="target" position={Position.Left} className="opacity-0" />
      <span className="text-sm font-medium leading-tight">{data.title}</span>
      {data.subtitle ? <span className="mt-0.5 text-[11px] leading-tight opacity-80">{data.subtitle}</span> : null}
      <Handle id="out" type="source" position={Position.Bottom} className="opacity-0" />
      <Handle id="side-out" type="source" position={Position.Right} className="opacity-0" />
    </button>
  )
}

export const setupNodeTypes = { setup: SetupNode }
