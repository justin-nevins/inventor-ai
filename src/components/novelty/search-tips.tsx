'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Lightbulb, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SearchTipsProps {
  inventionName?: string
}

export function SearchTips({ inventionName }: SearchTipsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const tips = [
    {
      do: 'Be specific about the core function',
      example: '"automatic pet feeder with portion control"',
      dont: '"smart device for pets"',
    },
    {
      do: 'List distinct features separately',
      example: 'Camera monitoring, Smartphone app, Scheduled feeding',
      dont: '"has many smart features"',
    },
    {
      do: 'Describe the problem clearly',
      example: '"Pet owners forget to feed pets when traveling"',
      dont: '"Makes life easier"',
    },
    {
      do: 'Use industry terms if known',
      example: '"IoT-enabled", "voice-activated", "solar-powered"',
      dont: '"Uses technology"',
    },
    {
      do: 'Mention target user or use case',
      example: '"for frequent travelers with cats"',
      dont: '"for anyone"',
    },
  ]

  // Example of how queries are generated
  const exampleQueries = [
    'automatic pet feeder camera',
    'pet feeder voice control',
    'wifi pet food dispenser app',
  ]

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="py-4">
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2 text-amber-700">
            <Lightbulb className="h-4 w-4" />
            <span className="font-medium text-sm">
              Tips for Better Search Results
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-amber-600" />
          ) : (
            <ChevronDown className="h-4 w-4 text-amber-600" />
          )}
        </Button>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* Tips Table */}
            <div className="space-y-3">
              {tips.map((tip, index) => (
                <div key={index} className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-neutral-700">{tip.do}</span>
                      <div className="text-xs text-green-700 mt-0.5 font-mono">
                        {tip.example}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-neutral-500">Avoid</span>
                      <div className="text-xs text-red-600 mt-0.5 font-mono">
                        {tip.dont}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* How Search Works */}
            <div className="pt-3 border-t border-amber-200">
              <h4 className="text-sm font-medium text-amber-800 mb-2">
                How We Search
              </h4>
              <p className="text-xs text-amber-700 mb-2">
                Your invention is decomposed into multiple focused search queries
                for better coverage:
              </p>
              <div className="flex flex-wrap gap-2">
                {exampleQueries.map((query, index) => (
                  <span
                    key={index}
                    className="text-xs bg-white px-2 py-1 rounded border border-amber-200 text-amber-800 font-mono"
                  >
                    &quot;{query}&quot;
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-600 mt-2">
                We search Amazon, eBay, Kickstarter, Indiegogo, and the broader web
                to find existing products.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
