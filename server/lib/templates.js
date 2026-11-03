import Handlebars from 'handlebars'
import mjml2html from 'mjml'
import { convert } from 'html-to-text'
import { fail } from './http.js'

Handlebars.registerHelper('year', () => new Date().getFullYear())
Handlebars.registerHelper('uppercase', (value) => String(value ?? '').toUpperCase())
Handlebars.registerHelper('lowercase', (value) => String(value ?? '').toLowerCase())
Handlebars.registerHelper('default', (value, fallback) => (value === undefined || value === null || value === '' ? fallback : value))

export function renderSubject(subject, variables = {}) {
  try {
    return Handlebars.compile(String(subject || ''), { noEscape: true })(variables)
  } catch {
    return String(subject || '')
  }
}

export function renderMjml(mjml, variables = {}) {
  try {
    return Handlebars.compile(String(mjml || ''))(variables)
  } catch (error) {
    throw fail(400, 'template_render_failed', `Template variables could not be rendered: ${error.message}`)
  }
}

export async function compileMjml(mjml, variables = {}) {
  const rendered = renderMjml(mjml, variables)
  let result
  try {
    result = await mjml2html(rendered, { validationLevel: 'soft', minify: false, filePath: undefined })
  } catch (error) {
    throw fail(400, 'mjml_compile_failed', `MJML could not be compiled: ${error.message}`)
  }
  if (!result?.html) {
    throw fail(400, 'mjml_compile_failed', 'MJML returned no HTML output.')
  }
  return { html: result.html, errors: result.errors || [], renderedSource: rendered }
}

export function htmlToText(html) {
  return convert(String(html || ''), {
    wordwrap: 100,
    selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { hideLinkHrefIfSameAsText: true } }],
  }).trim()
}

export function normaliseVariables(variables) {
  if (!Array.isArray(variables)) return []
  return variables
    .filter((variable) => variable && variable.key)
    .map((variable) => ({
      key: String(variable.key).replace(/[^\w.]/g, '_').slice(0, 60),
      sample: String(variable.sample ?? ''),
      label: String(variable.label || variable.key).slice(0, 120),
    }))
    .filter((variable, index, list) => list.findIndex((item) => item.key === variable.key) === index)
}

export function slugify(value, fallback = 'template') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || fallback
}

export function templateView(template, versions) {
  const sorted = [...versions].sort((a, b) => b.version - a.version)
  const latest = sorted[0]
  const published = sorted.find((version) => version.status === 'published')
  return {
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    subject: latest?.subject || '',
    mjml: latest?.mjml || '',
    variables: latest ? JSON.parse(latest.variables_json || '[]') : [],
    version: latest?.version || 1,
    publishedVersion: published?.version || null,
    status: latest?.status === 'published' ? 'published' : 'draft',
    updatedAt: template.updated_at,
    createdAt: template.created_at,
    html: latest?.html || '',
    compileErrors: [],
  }
}
