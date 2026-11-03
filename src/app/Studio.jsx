import { useEffect, useMemo, useRef, useState } from 'react'
import mjml2html from 'mjml-browser'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  FlaskConical,
  History,
  Laptop,
  Layers,
  Mail,
  Monitor,
  MoreHorizontal,
  Plus,
  Rocket,
  Save,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { Badge, Button, CopyButton, Field, Modal, Toggle } from '../components/ui'
import { cx } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader } from './shared'

const emptyTemplateSource = `<mjml>
  <mj-head>
    <mj-title>New template</mj-title>
    <mj-preview>Write a short preview line.</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica Neue, Helvetica, Arial, sans-serif" />
      <mj-text color="#171B17" font-size="15px" line-height="1.7" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#EFEBE1" width="600px">
    <mj-section background-color="#FFFFFF" padding="44px 40px">
      <mj-column>
        <mj-text font-size="34px" font-weight="800">Hello {{name}}.</mj-text>
        <mj-text>This is your new Postique template.</mj-text>
        <mj-button href="{{cta_url}}" background-color="#131713" color="#F7F4EB">
          Open the app
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`

function compileWithValues(source, values) {
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => values[key] ?? '')
}

function PreviewFrame({ html, device, compiling }) {
  const containerRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!containerRef.current) return undefined
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const emailWidth = device === 'mobile' ? 390 : 600
  const availableWidth = Math.max(size.width - 28, 200)
  const scale = Math.min(1, availableWidth / emailWidth)
  const frameHeight = Math.max(360, (Math.max(size.height, 420) - 28) / scale)
  const left = Math.max(14, (size.width - emailWidth * scale) / 2)

  return (
    <div className="preview-viewport" ref={containerRef}>
      {compiling && !html ? (
        <div className="preview-loading">
          <span className="button__spinner" /> Compiling MJML…
        </div>
      ) : (
        <div
          className="preview-frame"
          style={{
            width: emailWidth,
            height: frameHeight,
            left,
            top: 14,
            transform: `scale(${scale})`,
          }}
        >
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={html || '<!doctype html><html><body style="font-family:Arial;padding:40px;color:#777">Preview unavailable</body></html>'}
          />
        </div>
      )}
    </div>
  )
}

function TemplateListItem({ template, active, onClick }) {
  return (
    <button className={cx('template-list-item', active && 'is-active')} onClick={onClick}>
      <span className="template-list-item__icon">
        <Mail size={14} />
      </span>
      <span className="template-list-item__main">
        <span className="template-list-item__top">
          <strong>{template.name}</strong>
          <span className={cx('template-state', `template-state--${template.status}`)}>
            {template.status === 'published' ? 'Live' : 'Draft'}
          </span>
        </span>
        <span className="template-list-item__meta">
          v{template.version} · {template.updated}
        </span>
      </span>
      <ChevronDown size={13} className="template-list-item__chevron" />
    </button>
  )
}

function VariablesModal({ open, onClose, template, values, onChange, onSave }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Template variables"
      eyebrow="Preview data"
      description="These sample values are used in the live preview. Your API supplies the real values at send time."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onSave}>Save sample values</Button>
        </>
      }
    >
      <div className="variables-list">
        {template.variables.map((variable) => (
          <Field key={variable.key} label={variable.key} hint={`Use {{${variable.key}}} anywhere in the template.`}>
            <input
              className="input"
              value={values[variable.key] ?? ''}
              onChange={(event) => onChange(variable.key, event.target.value)}
            />
          </Field>
        ))}
        <div className="variables-tip">
          <Sparkles size={14} />
          <p>
            Variables are replaced before MJML compilation, so they work inside text, links, image URLs and
            subject lines.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function TestSendModal({ open, onClose, template, subject, onSend }) {
  const [to, setTo] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send a test"
      eyebrow="Test send"
      description="Preview the real rendered email in your inbox before publishing."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<Send size={14} />} onClick={() => onSend(to)}>
            Send test
          </Button>
        </>
      }
    >
      <div className="test-send">
        <div className="test-send__from">
          <span>From</span>
          <strong>Acme Commerce &lt;orders@acme.co.ke&gt;</strong>
          <Badge tone="success">verified</Badge>
        </div>
        <Field label="To" hint="Use an address you can open. This demo does not send live email.">
          <input className="input" value={to} onChange={(event) => setTo(event.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Subject">
          <input className="input" value={subject} readOnly />
        </Field>
        <Field label="Template">
          <input className="input" value={template.name} readOnly />
        </Field>
        <div className="test-send__note">
          <FlaskConical size={14} />
          <span>Demo mode · the send is simulated, but the preview uses the real compiled MJML.</span>
        </div>
      </div>
    </Modal>
  )
}

function VersionModal({ open, onClose, template }) {
  const versions = Array.from({ length: Math.max(template.version, 1) }, (_, index) => template.version - index)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Version history"
      eyebrow={template.name}
      description="Drafts are saved independently. Publishing promotes a version for new sends."
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="version-list">
        {versions.map((version, index) => (
          <div key={version} className="version-row">
            <span className={cx('version-dot', index === 0 && 'is-live')} />
            <div>
              <strong>
                Version {version}
                {index === 0 && template.status === 'published' && <span className="version-live">Current</span>}
              </strong>
              <span>{index === 0 ? 'Just now' : `${index * 3 + 1} days ago`} · Annan Ogero</span>
            </div>
            {index === 0 ? (
              <Badge tone={template.status === 'published' ? 'success' : 'warning'}>
                {template.status === 'published' ? 'Live' : 'Draft'}
              </Badge>
            ) : (
              <button className="version-restore" onClick={onClose}>
                Restore
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

export default function Studio() {
  const {
    templates,
    createTemplate,
    saveTemplate,
    publishTemplate,
    duplicateTemplate,
    testTemplate,
    toast,
  } = useStore()
  const [selectedId, setSelectedId] = useState(templates[0]?.id)
  const selected = templates.find((template) => template.id === selectedId) || templates[0]
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [name, setName] = useState(selected?.name || '')
  const [subject, setSubject] = useState(selected?.subject || '')
  const [source, setSource] = useState(selected?.mjml || '')
  const [values, setValues] = useState({})
  const [html, setHtml] = useState('')
  const [errors, setErrors] = useState([])
  const [compiling, setCompiling] = useState(false)
  const [device, setDevice] = useState('desktop')
  const [variablesOpen, setVariablesOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)
  const [previewFull, setPreviewFull] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const codeRef = useRef(null)
  const gutterRef = useRef(null)

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setSubject(selected.subject)
    setSource(selected.mjml)
    setValues(Object.fromEntries((selected.variables || []).map((variable) => [variable.key, variable.sample])))
  }, [selectedId])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setCompiling(true)
      try {
        const rendered = compileWithValues(source || emptyTemplateSource, values)
        const result = await mjml2html(rendered, { validationLevel: 'soft', minify: false })
        if (!cancelled) {
          setHtml(result.html)
          setErrors(result.errors || [])
        }
      } catch (error) {
        if (!cancelled) {
          setErrors([{ line: 0, message: error.message || 'Could not compile this MJML.' }])
        }
      } finally {
        if (!cancelled) setCompiling(false)
      }
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [source, values])

  const filteredTemplates = useMemo(() => {
    let list = templates
    if (filter === 'published') list = list.filter((template) => template.status === 'published')
    if (filter === 'drafts') list = list.filter((template) => template.status === 'draft')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (template) =>
          template.name.toLowerCase().includes(q) ||
          template.description.toLowerCase().includes(q) ||
          template.slug.includes(q),
      )
    }
    return list
  }, [templates, filter, search])

  if (!selected) {
    return (
      <div className="page page--studio">
        <PageHeader
          eyebrow="Design & send"
          title="Template studio"
          description="Build responsive email with MJML, preview real output, and publish versions your API can send."
        />
        <div className="empty-state empty-state--panel">
          <span className="empty-state__icon">
            <Layers size={22} />
          </span>
          <h3>Create your first template</h3>
          <p>Start with a responsive MJML layout, then publish a version your API can send.</p>
          <Button
            onClick={async () => {
              const id = await createTemplate()
              if (id) setSelectedId(id)
            }}
            icon={<Plus size={15} />}
          >
            New template
          </Button>
        </div>
      </div>
    )
  }

  const hasChanges = source !== selected.mjml || name !== selected.name || subject !== selected.subject
  const lineCount = source.split('\n').length

  const selectTemplate = (id) => {
    if (id === selectedId) return
    if (hasChanges && !window.confirm('You have unsaved changes. Discard them and switch templates?')) return
    setSelectedId(id)
  }

  const newTemplate = async () => {
    if (hasChanges && !window.confirm('You have unsaved changes. Discard them and create a new template?')) return
    const id = await createTemplate()
    if (!id) return
    setSelectedId(id)
  }

  const save = async (silent = false) => {
    const result = await saveTemplate(
      selected.id,
      {
        mjml: source,
        name,
        subject,
        variables: (selected.variables || []).map((variable) => ({
          ...variable,
          sample: values[variable.key] ?? variable.sample,
        })),
      },
      { silent },
    )
    return result
  }

  const publish = async () => {
    const saved = await save(true)
    if (saved) await publishTemplate(selected.id)
  }

  const updateCursor = () => {
    const element = codeRef.current
    if (!element) return
    const before = element.value.slice(0, element.selectionStart)
    const lines = before.split('\n')
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 })
  }

  return (
    <div className="page page--studio">
      <PageHeader
        eyebrow="Design & send"
        title="Template studio"
        description="Build responsive email with MJML, preview real output, and publish versions your API can send."
        actions={
          <>
            <Button variant="secondary" onClick={() => setTestOpen(true)} icon={<FlaskConical size={15} />}>
              Send test
            </Button>
            <Button variant="secondary" onClick={newTemplate} icon={<Plus size={15} />}>
              New template
            </Button>
            <Button onClick={publish} icon={<Rocket size={15} />}>
              Publish changes
            </Button>
          </>
        }
      />

      <div className="studio-shell">
        <aside className="studio-sidebar">
          <div className="studio-sidebar__head">
            <div>
              <strong>Templates</strong>
              <span>{templates.length} total</span>
            </div>
            <button className="icon-button" onClick={newTemplate} aria-label="New template">
              <Plus size={15} />
            </button>
          </div>
          <div className="studio-sidebar__search">
            <Search size={13} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a template…" />
          </div>
          <div className="studio-sidebar__filters">
            {[
              ['all', 'All'],
              ['published', 'Live'],
              ['drafts', 'Drafts'],
            ].map(([key, label]) => (
              <button key={key} className={cx(filter === key && 'is-active')} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="studio-sidebar__list">
            {filteredTemplates.map((template) => (
              <TemplateListItem
                key={template.id}
                template={template}
                active={template.id === selected.id}
                onClick={() => selectTemplate(template.id)}
              />
            ))}
            {filteredTemplates.length === 0 && <p className="studio-sidebar__empty">No templates match.</p>}
          </div>
          <button className="studio-sidebar__new" onClick={newTemplate}>
            <Plus size={14} /> New template
          </button>
        </aside>

        <section className="studio-main">
          <div className="studio-titlebar">
            <div className="studio-titlebar__identity">
              <span className={cx('studio-status', selected.status === 'published' ? 'is-live' : 'is-draft')}>
                <span />
                {selected.status === 'published' ? 'Published' : 'Draft'}
              </span>
              <div className="studio-titlebar__input">
                <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Template name" />
                <span>
                  {selected.slug}.mjml · v{selected.version}
                  {hasChanges && <em> · unsaved</em>}
                </span>
              </div>
            </div>
            <div className="studio-titlebar__actions">
              <button className="studio-icon-label" onClick={() => setVersionOpen(true)}>
                <History size={13} /> v{selected.version}
              </button>
              <button className="studio-icon-label" onClick={() => duplicateTemplate(selected.id)}>
                Duplicate
              </button>
              <Button variant="secondary" size="sm" onClick={() => save()} icon={<Save size={13} />}>
                Save draft
              </Button>
              <Button size="sm" onClick={publish} icon={<Rocket size={13} />}>
                Publish
              </Button>
            </div>
          </div>

          <div className="studio-toolbar">
            <div className="studio-toolbar__left">
              <div className="studio-mobile-templates">
                <Layers size={12} />
                <select value={selected.id} onChange={(event) => selectTemplate(event.target.value)} aria-label="Choose template">
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={11} />
              </div>
              <span className="studio-toolbar__file">
                <Code2 size={13} /> source.mjml
              </span>
              <button className="studio-toolbar__chip" onClick={() => setVariablesOpen(true)}>
                <Wand2 size={12} /> Variables
                <span>{selected.variables.length}</span>
              </button>
              <span className={cx('studio-compile-state', compiling && 'is-working')}>
                <span /> {compiling ? 'Compiling…' : errors.length ? `${errors.length} warning${errors.length > 1 ? 's' : ''}` : 'Compiled'}
              </span>
            </div>
            <div className="studio-toolbar__right">
              <button className="studio-toolbar__ghost" onClick={() => setTestOpen(true)}>
                <Mail size={12} /> Subject
              </button>
              <button className="studio-toolbar__ghost" onClick={() => setPreviewFull(true)}>
                Preview
              </button>
            </div>
          </div>

          <div className="studio-workspace">
            <div className="studio-code">
              <div className="studio-panelhead">
                <span>
                  <span className="code-dot" /> MJML
                </span>
                <div>
                  <button onClick={() => toast('Editor copied', 'success')} title="Copy source">
                    <Copy size={12} />
                  </button>
                  <button onClick={() => setVariablesOpen(true)} title="Variables">
                    <Wand2 size={12} />
                  </button>
                </div>
              </div>
              <div className="code-editor">
                <pre className="code-gutter" ref={gutterRef} aria-hidden="true">
                  {Array.from({ length: lineCount }, (_, index) => `${index + 1}`).join('\n')}
                </pre>
                <textarea
                  ref={codeRef}
                  value={source}
                  spellCheck="false"
                  wrap="off"
                  onChange={(event) => setSource(event.target.value)}
                  onScroll={(event) => {
                    if (gutterRef.current) gutterRef.current.scrollTop = event.target.scrollTop
                  }}
                  onSelect={updateCursor}
                  onClick={updateCursor}
                  onKeyUp={updateCursor}
                  aria-label="MJML source code"
                />
              </div>
              <div className="code-status">
                <span>MJML</span>
                <span>UTF-8</span>
                <span>Ln {cursor.line}, Col {cursor.col}</span>
                <span className="code-status__right">
                  <Sparkles size={10} /> Auto-compiled
                </span>
              </div>
            </div>

            <div className="studio-preview">
              <div className="studio-panelhead studio-panelhead--light">
                <span>Live preview</span>
                <div className="device-switch">
                  <button
                    className={cx(device === 'desktop' && 'is-active')}
                    onClick={() => setDevice('desktop')}
                    title="Desktop preview"
                  >
                    <Monitor size={12} />
                  </button>
                  <button
                    className={cx(device === 'mobile' && 'is-active')}
                    onClick={() => setDevice('mobile')}
                    title="Mobile preview"
                  >
                    <Smartphone size={12} />
                  </button>
                </div>
              </div>
              <div className="preview-meta">
                <div>
                  <span>From</span>
                  <strong>Acme Commerce &lt;orders@acme.co.ke&gt;</strong>
                </div>
                <div>
                  <span>Subject</span>
                  <strong>{compileWithValues(subject, values)}</strong>
                </div>
              </div>
              <PreviewFrame html={html} device={device} compiling={compiling} />
              {errors.length > 0 && (
                <div className="compile-errors">
                  <strong>{errors.length} compile warning{errors.length > 1 ? 's' : ''}</strong>
                  <span>{errors[0].message}</span>
                  <button onClick={() => setErrors([])}>Dismiss</button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <VariablesModal
        open={variablesOpen}
        onClose={() => setVariablesOpen(false)}
        template={selected}
        values={values}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        onSave={() => {
          save()
          setVariablesOpen(false)
        }}
      />
      <TestSendModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        template={selected}
        subject={compileWithValues(subject, values)}
        onSend={async (to) => {
          const result = await testTemplate(selected.id, to)
          if (result) setTestOpen(false)
        }}
      />
      <VersionModal open={versionOpen} onClose={() => setVersionOpen(false)} template={selected} />

      {previewFull && (
        <div className="preview-modal" onClick={(event) => event.target === event.currentTarget && setPreviewFull(false)}>
          <div className="preview-modal__card">
            <div className="preview-modal__head">
              <div>
                <span>FULL PREVIEW</span>
                <strong>{compileWithValues(subject, values)}</strong>
              </div>
              <button onClick={() => setPreviewFull(false)} aria-label="Close preview">
                <X size={18} />
              </button>
            </div>
            <iframe title="Full email preview" sandbox="" srcDoc={html} />
          </div>
        </div>
      )}
    </div>
  )
}
