"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { SearchIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get("search") || "")
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const updateSearch = useCallback(
    (term: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (term) {
        params.set("search", term)
      } else {
        params.delete("search")
      }
      params.set("page", "1")
      router.push(`/procesos?${params.toString()}`)
    },
    [router, searchParams]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (value !== searchParams.get("search") || "") {
        updateSearch(value)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, updateSearch, searchParams])

  useEffect(() => {
    const current = searchParams.get("search") || ""
    if (value !== current) {
      setValue(current)
    }
  }, [searchParams])

  return (
    <div className="relative w-full sm:w-80">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar procesos..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pl-8 pr-8"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => {
            setValue("")
            updateSearch("")
          }}
        >
          <XIcon className="size-3" />
        </Button>
      )}
    </div>
  )
}
