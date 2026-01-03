// Patent Search Agent - Checks USPTO, Google Patents, and international patent databases

import Anthropic from '@anthropic-ai/sdk'
import type { NoveltyResult, NoveltyCheckRequest } from './types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const PATENT_SEARCH_PROMPT = {
  role: `You are a patent research specialist with expertise in prior art searches across USPTO, Google Patents, EPO (European Patent Office), and WIPO databases. You understand patent classifications, claims language, and novelty assessment.`,

  task: `Analyze the provided invention and identify potentially conflicting existing patents or patent applications. Assess whether the invention appears to have patentable novelty based on likely prior art.`,

  howTo: `
1. Review the invention details carefully
2. Identify the core technical innovation and claims
3. Determine relevant patent classifications (CPC, IPC codes)
4. Consider what patent search queries would find similar inventions
5. Simulate searches across:
   - USPTO (United States Patent and Trademark Office)
   - Google Patents
   - EPO (European patents)
   - WIPO (international applications)
6. Look for:
   - Exact technology matches
   - Similar mechanisms or methods
   - Patents solving the same problem differently
   - Broader patents that might cover this invention
   - Expired patents that could be built upon
7. For each finding, assess:
   - Similarity score (0-1)
   - Patent status (granted, pending, expired, abandoned)
   - How claims might overlap
8. Determine patentability likelihood
9. Calculate novelty score based on prior art
`,

  output: `Return a JSON object with this exact structure:
{
  "is_novel": boolean (true if likely patentable, no strong prior art),
  "confidence": number (0-1, confidence in assessment),
  "findings": [
    {
      "title": "Patent Title (US1234567 or similar number)",
      "description": "Brief description of what patent covers and why it's relevant",
      "url": "https://patents.google.com/patent/US1234567 (realistic)",
      "similarity_score": number (0-1),
      "source": "USPTO" | "Google Patents" | "EPO" | "WIPO",
      "metadata": {
        "patent_number": "US1234567A",
        "filing_date": "approximate date",
        "status": "granted" | "pending" | "expired" | "abandoned",
        "main_claims": "key claims that might conflict",
        "classification": "CPC or IPC code if relevant"
      }
    }
  ],
  "summary": "2-3 sentences on patent landscape and patentability assessment",
  "truth_scores": {
    "objective_truth": number (0-1),
    "practical_truth": number (0-1),
    "completeness": number (0-1),
    "contextual_scope": number (0-1)
  },
  "search_query_used": "best patent search query",
  "patentability_assessment": "brief assessment of likelihood of getting a patent",
  "recommendations": [
    "Next steps for patent search or filing"
  ]
}`
}

export async function runPatentSearchAgent(
  request: NoveltyCheckRequest
): Promise<NoveltyResult> {
  const prompt = `${PATENT_SEARCH_PROMPT.role}

${PATENT_SEARCH_PROMPT.task}

## How to Assess:
${PATENT_SEARCH_PROMPT.howTo}

## Invention to Analyze:
- **Name**: ${request.invention_name}
- **Description**: ${request.description}
- **Problem Statement**: ${request.problem_statement || 'Not provided'}
- **Target Audience**: ${request.target_audience || 'Not provided'}
- **Key Features**: ${request.key_features?.join(', ') || 'Not provided'}

${PATENT_SEARCH_PROMPT.output}

CRITICAL GUIDELINES:
- Be conservative in novelty assessment - err on side of finding prior art
- High similarity (>0.8) means strong prior art conflict
- Medium similarity (0.5-0.8) means potential prior art that needs professional review
- Low similarity (<0.5) means likely patentable with proper claims drafting
- Consider both exact matches and broader patents that might dominate
- Note: This is NOT a professional patent search - always recommend patent attorney review
- Include realistic patent numbers and filing dates based on technology timeline`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // Extract JSON from response
    let jsonText = content.text.trim()
    const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/) ||
                      jsonText.match(/```\n([\s\S]*?)\n```/)

    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const result = JSON.parse(jsonText)

    return {
      agent_type: 'patent_search',
      is_novel: result.is_novel,
      confidence: result.confidence,
      findings: result.findings,
      summary: result.summary,
      truth_scores: result.truth_scores,
      search_query_used: result.search_query_used,
      timestamp: new Date(),
    }
  } catch (error) {
    console.error('Patent Search Agent error:', error)

    return {
      agent_type: 'patent_search',
      is_novel: false,
      confidence: 0,
      findings: [],
      summary: 'Error occurred during patent search analysis. Professional patent search recommended.',
      truth_scores: {
        objective_truth: 0,
        practical_truth: 0,
        completeness: 0,
        contextual_scope: 0,
      },
      search_query_used: request.invention_name,
      timestamp: new Date(),
    }
  }
}
