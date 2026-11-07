"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function DatePicker({
  id,
  placeholder = "Pick a date",
  className,
  value,
  onChange,
}: {
  id?: string
  placeholder?: string
  className?: string
  value?: Date
  onChange?: (value: Date | undefined) => void
}) {
  const [uncontrolled, setUncontrolled] = React.useState<Date>()
  const date = onChange ? value : uncontrolled
  const setDate = onChange ?? setUncontrolled

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        render={
          <Button
            variant="outline"
            data-empty={!date}
            className={cn(
              "w-[212px] justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {date ? format(date, "PPP") : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={setDate} />
      </PopoverContent>
    </Popover>
  )
}
