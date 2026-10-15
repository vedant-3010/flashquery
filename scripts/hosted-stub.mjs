// A stand-in for OpenRouter's chat completions, for testing HushGlance AI on your computer without
// spending credits (docs/HOSTED_AI_SETUP.md, part A):
//
//   node scripts/hosted-stub.mjs            # listens on http://localhost:8787
//
// and in supabase/functions/.env:
//
//   OPENROUTER_UPSTREAM=http://host.docker.internal:8787/v1/chat/completions
//
// Every answer is real and runnable but simple: a question gets the row count of the last table
// in its schema context; summaries, suggestions and dashboards are generic. It prints what the
// proxy forced on each request (the privacy settings, the output cap) and never the messages.

import http from 'node:http'

const port = Number(process.argv[2] ?? 8787)

const textOf = (content) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block) => block?.text ?? '').join('')
      : ''

/** The user's table: the last `{"name":…,"rows":…}` line of the schema context (src/ai/context.ts). */
function tableOf(messages) {
  const text = messages.map((message) => textOf(message.content)).join('\n')
  return [...text.matchAll(/\{"name":"([^"]+)","rows":\d+/g)].at(-1)?.[1] ?? null
}

const quote = (name) => `"${name.replaceAll('"', '""')}"`

function answerFor(schema, table) {
  if (schema === 'answer_summary') {
    return {
      headline: 'Answered by the local stand-in for OpenRouter.',
      bullets: ['Hosted AI works end to end on this computer.'],
      caveats: [],
    }
  }
  if (schema === 'suggested_questions') {
    return { questions: ['How many rows are there?', 'What does the data cover?'] }
  }
  if (schema === 'dashboard_plan') {
    return {
      title: 'Local test dashboard',
      tiles: table
        ? [
            {
              title: 'Rows',
              sql: `SELECT count(*) AS row_count FROM ${quote(table)}`,
              chartHint: null,
              size: 'kpi',
            },
          ]
        : [],
    }
  }
  return table
    ? {
        kind: 'sql',
        title: `Rows in ${table}`,
        sql: `SELECT count(*) AS row_count FROM ${quote(table)}`,
        python: null,
        explanation: 'Counts the rows. (A stand-in answer for local testing.)',
        assumptions: ['This answer comes from scripts/hosted-stub.mjs, not a model.'],
        tablesUsed: [table],
        columnsUsed: [],
        clarification: null,
        alternatives: [],
        chartHint: null,
      }
    : {
        kind: 'unanswerable',
        title: 'No data',
        sql: null,
        python: null,
        explanation: 'Load a dataset first.',
        assumptions: [],
        tablesUsed: [],
        columnsUsed: [],
        clarification: null,
        alternatives: [],
        chartHint: null,
      }
}

http
  .createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
        response.writeHead(404).end()
        return
      }
      const body = JSON.parse(raw || '{}')
      const schema = body.response_format?.json_schema?.name
      console.log(
        `${schema ?? 'chat'} · ${body.model} · provider ${JSON.stringify(body.provider)} · max_tokens ${body.max_tokens}`,
      )
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          id: `stub-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify(answerFor(schema, tableOf(body.messages ?? []))),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 3600, completion_tokens: 400, total_tokens: 4000, cost: 0.0112 },
        }),
      )
    })
  })
  .listen(port, () => console.log(`OpenRouter stand-in on http://localhost:${port}`))
