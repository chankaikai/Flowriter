import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import type { Root, RootContent, PhrasingContent, ListItem } from 'mdast'

type Inline = TextRun | ExternalHyperlink
type Block = Paragraph | Table

interface RunStyle {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  code?: boolean
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]

const MONO = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'Microsoft JhengHei' }

function run(text: string, st: RunStyle): TextRun {
  return new TextRun({
    text,
    bold: st.bold,
    italics: st.italics,
    strike: st.strike,
    font: st.code ? MONO : undefined,
    shading: st.code ? { type: ShadingType.CLEAR, fill: 'F1EFEA', color: 'auto' } : undefined
  })
}

function inline(nodes: PhrasingContent[], st: RunStyle = {}): Inline[] {
  const out: Inline[] = []
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        out.push(run(n.value, st))
        break
      case 'strong':
        out.push(...inline(n.children, { ...st, bold: true }))
        break
      case 'emphasis':
        out.push(...inline(n.children, { ...st, italics: true }))
        break
      case 'delete':
        out.push(...inline(n.children, { ...st, strike: true }))
        break
      case 'inlineCode':
        out.push(run(n.value, { ...st, code: true }))
        break
      case 'link':
        out.push(
          new ExternalHyperlink({
            link: n.url,
            children: [
              new TextRun({
                text: n.children.map((c) => ('value' in c ? c.value : '')).join('') || n.url,
                color: '0563C1',
                underline: {},
                bold: st.bold,
                italics: st.italics
              })
            ]
          })
        )
        break
      case 'image':
        out.push(run(`[圖片：${n.alt || n.url}]`, { ...st, italics: true }))
        break
      case 'break':
        out.push(new TextRun({ break: 1 }))
        break
      case 'html':
        out.push(run(n.value.replace(/<[^>]+>/g, ''), st))
        break
      case 'footnoteReference':
        out.push(new TextRun({ text: `[${n.label ?? n.identifier}]`, superScript: true }))
        break
      default: {
        const anyNode = n as unknown as { type: string; value?: string }
        if (anyNode.type === 'inlineMath' && anyNode.value) {
          out.push(run(anyNode.value, { ...st, italics: true }))
        }
      }
    }
  }
  return out
}

interface Ctx {
  quote: number
  listLevel: number
  nextInstance: { n: number }
}

function plain(nodes: PhrasingContent[]): string {
  return nodes
    .map((n) => ('value' in n ? n.value : 'children' in n ? plain(n.children as PhrasingContent[]) : ''))
    .join('')
}

function quoteProps(ctx: Ctx) {
  return ctx.quote
    ? {
        indent: { left: 360 * ctx.quote },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'C9C4B8', space: 8 } }
      }
    : {}
}

function listItem(
  item: ListItem,
  ordered: boolean,
  instance: number,
  ctx: Ctx
): Block[] {
  const out: Block[] = []
  const prefix = item.checked === true ? '☑ ' : item.checked === false ? '☐ ' : ''
  let first = true
  for (const child of item.children) {
    if (child.type === 'paragraph' && first) {
      out.push(
        new Paragraph({
          numbering: {
            reference: ordered ? 'ol' : 'ul',
            level: Math.min(ctx.listLevel, 5),
            instance
          },
          spacing: { after: 80 },
          children: [...(prefix ? [new TextRun(prefix)] : []), ...inline(child.children)]
        })
      )
    } else if (child.type === 'list') {
      out.push(...blocks([child], { ...ctx, listLevel: ctx.listLevel + 1 }))
    } else {
      out.push(...blocks([child], ctx))
    }
    first = false
  }
  return out
}

function blocks(nodes: RootContent[], ctx: Ctx): Block[] {
  const out: Block[] = []
  for (const n of nodes) {
    switch (n.type) {
      case 'heading':
        out.push(
          new Paragraph({
            heading: HEADINGS[n.depth - 1],
            spacing: { before: 280, after: 120 },
            children: inline(n.children)
          })
        )
        break
      case 'paragraph':
        out.push(
          new Paragraph({
            spacing: { after: 160, line: 340 },
            ...quoteProps(ctx),
            children: inline(n.children)
          })
        )
        break
      case 'blockquote':
        out.push(...blocks(n.children, { ...ctx, quote: ctx.quote + 1 }))
        break
      case 'list': {
        const instance = ctx.nextInstance.n++
        for (const it of n.children) out.push(...listItem(it, !!n.ordered, instance, ctx))
        break
      }
      case 'code':
        for (const line of n.value.split('\n')) {
          out.push(
            new Paragraph({
              spacing: { after: 0 },
              shading: { type: ShadingType.CLEAR, fill: 'F6F4EF', color: 'auto' },
              children: [new TextRun({ text: line || ' ', font: MONO, size: 20 })]
            })
          )
        }
        out.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
        break
      case 'thematicBreak':
        out.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D8D3C8', space: 1 } },
            children: []
          })
        )
        break
      case 'table': {
        const rows = n.children.map(
          (row, ri) =>
            new TableRow({
              tableHeader: ri === 0,
              children: row.children.map(
                (cell) =>
                  new TableCell({
                    shading:
                      ri === 0 ? { type: ShadingType.CLEAR, fill: 'F6F4EF', color: 'auto' } : undefined,
                    margins: { top: 60, bottom: 60, left: 120, right: 120 },
                    children: [
                      new Paragraph({
                        children: inline(cell.children, { bold: ri === 0 })
                      })
                    ]
                  })
              )
            })
        )
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }))
        out.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
        break
      }
      case 'footnoteDefinition':
        out.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: `[${n.label ?? n.identifier}] `, superScript: true }),
              ...n.children.flatMap((c) =>
                c.type === 'paragraph' ? [new TextRun({ text: plain(c.children), size: 20 })] : []
              )
            ]
          })
        )
        break
      case 'html':
        if (n.value.replace(/<[^>]+>/g, '').trim()) {
          out.push(new Paragraph({ children: [new TextRun(n.value.replace(/<[^>]+>/g, ''))] }))
        }
        break
      default: {
        const anyNode = n as unknown as { type: string; value?: string }
        if (anyNode.type === 'math' && anyNode.value) {
          for (const line of anyNode.value.split('\n')) {
            out.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: line, italics: true, font: MONO })]
              })
            )
          }
        }
        // yaml front matter 等其餘節點略過
      }
    }
  }
  return out
}

function numberingLevels(format: (typeof LevelFormat)[keyof typeof LevelFormat], bullets: string[]) {
  return Array.from({ length: 6 }, (_, level) => ({
    level,
    format,
    text: format === LevelFormat.BULLET ? bullets[level % bullets.length] : `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 540 + level * 360, hanging: 360 } } }
  }))
}

export async function buildDocx(md: string): Promise<Uint8Array> {
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath)
    .parse(md) as Root

  const children = blocks(tree.children, { quote: 0, listLevel: 0, nextInstance: { n: 1 } })

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft JhengHei' },
            size: 22
          }
        }
      }
    },
    numbering: {
      config: [
        { reference: 'ul', levels: numberingLevels(LevelFormat.BULLET, ['•', '◦', '▪']) },
        { reference: 'ol', levels: numberingLevels(LevelFormat.DECIMAL, []) }
      ]
    },
    sections: [{ children }]
  })

  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}
