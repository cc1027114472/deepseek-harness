import { describe, expect, it } from 'vitest'
import { jsonSchemaToTs, renderToolsSdk } from '@deepseek-ai/dsh-tools/src/ts-types.ts'
import type { ToolSdkSchema } from '@deepseek-ai/dsh-tools/src/ts-types.ts'
import { parameterSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools'

describe('jsonSchemaToTs', () => {
  it('maps every unified schema construct', () => {
    const cases: [unknown, string][] = [
      [{ type: 'string' }, 'string'],
      [{ type: 'number' }, 'number'],
      [{ type: 'integer' }, 'number'],
      [{ type: 'boolean' }, 'boolean'],
      [{ type: 'null' }, 'null'],
      [{ type: 'string', enum: ['a', 'b'] }, '"a" | "b"'],
      [{ type: 'number', enum: [1, 2] }, '1 | 2'],
      [{ type: 'integer', const: 2 }, '2'],
      [{ type: 'boolean', const: true }, 'true'],
      [{ type: 'null', const: null }, 'null'],
      [{ type: 'string', enum: ['a', 'b'], const: 'a' }, '"a"'],
      [{ oneOf: [{ type: 'string' }, { type: 'null' }] }, 'string | null'],
      [{ type: 'array', items: { type: 'number' } }, 'number[]'],
      [{ type: 'array', items: { type: 'string', enum: ['x', 'y'] } }, '("x" | "y")[]'],
      [{ type: 'array' }, 'JsonValue[]'],
      [{ type: 'object' }, 'Record<string, JsonValue>'],
      [{ type: 'object', additionalProperties: false }, 'Record<string, never>'],
      [{ type: 'object', properties: {} }, 'Record<string, JsonValue>'],
      [{ type: 'object', properties: {}, additionalProperties: false }, 'Record<string, never>'],
      [{
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'integer' }, label: { type: 'string' } },
        required: ['id'],
      }, ['{', '  id: number;', '  label?: string;', '}'].join('\n')],
      [{}, 'JsonValue'],
    ]
    for (const [schema, expected] of cases) {
      expect(jsonSchemaToTs(schema), JSON.stringify(schema)).toBe(expected)
    }
  })

  it('renders objects with required/optional keys, nested shapes, and per-property docs', () => {
    const schema = parameterSchemaSpecToJsonSchema({
      path: { type: 'string', required: true, description: 'Absolute file path' },
      limit: { type: 'number' },
      opts: {
        type: 'object',
        additionalProperties: true,
        properties: { deep: { type: 'boolean', required: true } },
      },
    })
    expect(jsonSchemaToTs(schema)).toBe([
      '{',
      '  /** Absolute file path */',
      '  path: string;',
      '  limit?: number;',
      '  opts?: {',
      '    deep: boolean;',
      '  } & Record<string, JsonValue>;',
      '} & Record<string, JsonValue>',
    ].join('\n'))
  })

  it('is total: unsupported or hostile constructs degrade to unknown, never throw', () => {
    const cases: unknown[] = [
      undefined,
      null,
      42,
      'string-schema',
      { oneOf: [{ type: 'string' }] },
      { $ref: '#/defs/x' },
      { type: 'object', properties: 7 },
      { type: 'object', properties: { bad: { $ref: 'x' } } },
      { type: 'string', enum: [1, 2] },
      { type: 'string', enum: [] },
    ]
    for (const schema of cases) {
      expect(() => jsonSchemaToTs(schema), JSON.stringify(schema)).not.toThrow()
    }
    expect(jsonSchemaToTs({ oneOf: [] })).toBe('unknown')
    expect(jsonSchemaToTs({ type: 'object', properties: 7 })).toBe('unknown')
    expect(jsonSchemaToTs({ type: 'object', properties: { bad: { $ref: 'x' } }, required: ['bad'] })).toBe('unknown')
    expect(jsonSchemaToTs({ type: 'string', enum: [1, 2] })).toBe('unknown')
    expect(jsonSchemaToTs({ type: 'string', enum: [] })).toBe('unknown')
    expect(jsonSchemaToTs({ type: 'object', properties: { a: { type: 'string' } }, required: [7] })).toBe('unknown')
    expect(jsonSchemaToTs({ type: 'object', properties: { weird: 42 } })).toBe('unknown')
  })

  it('escapes a comment-closer inside a description so the generated JSDoc cannot end early', () => {
    const rendered = jsonSchemaToTs({
      type: 'object',
      properties: { glob: { type: 'string', description: 'a pattern like packages/*/tool-*/ over here' } },
    })
    expect(rendered).not.toContain('tool-*/ over')
    expect(rendered).toContain(String.raw`tool-*\/ over`)
  })

  it('renders deeply nested unions without using the JavaScript call stack', () => {
    const depth = 5_000
    let schema: unknown = { type: 'string' }
    for (let index = 0; index < depth; index++) schema = { oneOf: [schema, { type: 'null' }] }

    const rendered = jsonSchemaToTs(schema)

    expect(rendered.startsWith('string | null')).toBe(true)
    expect(rendered.length).toBe('string'.length + depth * ' | null'.length)
  })
})

describe('renderToolsSdk', () => {
  const bash: ToolSdkSchema = {
    name: 'bash',
    description: 'Run a shell command.',
    parameters: parameterSchemaSpecToJsonSchema({
      command: { type: 'string', required: true },
      description: { type: 'string', required: true },
    }) as unknown as Record<string, unknown>,
    output: {
      type: 'object',
      additionalProperties: false,
      properties: { exitCode: { type: 'integer' } },
      required: ['exitCode'],
    },
  }
  const exotic: ToolSdkSchema = {
    name: 'my-mcp.tool',
    description: 'Exotic name.',
    parameters: parameterSchemaSpecToJsonSchema({}) as unknown as Record<string, unknown>,
    output: { type: 'array', items: { type: 'string' } },
  }

  it('renders ToolArgsMap, ToolOutputMap, ToolCallError, and tools sorted by name', () => {
    const text = renderToolsSdk([exotic, bash])
    expect(text).toContain('interface ToolArgsMap {')
    expect(text).toContain('  /** Run a shell command. */\n  bash: {\n    command: string;\n    description: string;\n  } & Record<string, JsonValue>;')
    expect(text).toContain('  /** Exotic name. */\n  "my-mcp.tool": Record<string, JsonValue>;')
    expect(text).toContain('interface ToolOutputMap {\n  bash: {\n    exitCode: number;\n  };\n  "my-mcp.tool": string[];\n}')
    expect(text).toContain('type ToolName = keyof ToolOutputMap;')
    expect(text).toContain('declare class ToolCallError extends Error {\n  readonly name: "ToolCallError";\n  readonly toolName: ToolName;\n}')
    expect(text).toContain('declare const tools: {\n  readonly [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;\n};')
    expect(text).toContain('reject with `ToolCallError`')
    expect(text).toContain('Promise.all')
    expect(text).toContain('await tools.name(args)')
    // Sorted: bash appears before my-mcp.tool.
    expect(text.indexOf('  bash:')).toBeLessThan(text.indexOf('  "my-mcp.tool":'))
  })

  it('names both required call arguments and shows a complete example when bash or pwsh is registered', () => {
    const text = renderToolsSdk([bash])
    expect(text).toContain('`code`')
    expect(text).toContain('`description`')
    expect(text).toContain('two required arguments')
    expect(text).toContain('run_code({\n  code: "return await tools.bash({ command: \'pwd\', description: \'Show current directory\' })",\n  description: "Show current directory"\n})')
    expect(renderToolsSdk([exotic])).not.toContain('tools.bash(')
    const pwsh = { ...bash, name: 'pwsh' }
    expect(renderToolsSdk([pwsh])).toContain('tools.pwsh(')
  })

  it('is deterministic regardless of input order', () => {
    expect(renderToolsSdk([bash, exotic])).toBe(renderToolsSdk([exotic, bash]))
  })

  it('renders valid empty interfaces when no tools are registered', () => {
    const text = renderToolsSdk([])
    expect(text).toContain('interface ToolArgsMap {\n}')
    expect(text).toContain('interface ToolOutputMap {\n}')
  })
})
