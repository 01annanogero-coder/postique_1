import { useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  Cloud,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileImage,
  Globe2,
  HardDrive,
  Image,
  Info,
  Link2,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Badge, Button, CopyButton, Field, Modal, ProgressBar, Toggle } from '../components/ui'
import { cx, copyText, formatBytes } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader } from './shared'

const filters = [
  { id: 'all', label: 'All assets' },
  { id: 'Image', label: 'Images' },
  { id: 'Logo', label: 'Logos' },
  { id: 'Icons', label: 'Icons' },
]

function AssetCard({ asset, onOpen, onDelete }) {
  const { toggleAsset } = useStore()
  const [menu, setMenu] = useState(false)
  return (
    <div className="asset-card">
      <button className="asset-card__preview" onClick={() => onOpen(asset)}>
        <img src={asset.preview} alt={asset.name} />
        <span className="asset-card__overlay">
          <Eye size={16} /> Preview
        </span>
      </button>
      <div className="asset-card__body">
        <div className="asset-card__title">
          <div>
            <strong>{asset.name}</strong>
            <span>
              {asset.dimensions} · {asset.size}
            </span>
          </div>
          <div className="asset-card__menu-wrap">
            <button className="asset-card__more" onClick={() => setMenu(!menu)} aria-label={`Options for ${asset.name}`}>
              <MoreHorizontal size={15} />
            </button>
            {menu && (
              <div className="asset-menu">
                <button onClick={() => { toggleAsset(asset.id); setMenu(false) }}>
                  {asset.public ? <LockKeyhole size={13} /> : <Globe2 size={13} />}
                  {asset.public ? 'Make private' : 'Make public'}
                </button>
                <button onClick={() => copyText(asset.url).then(() => setMenu(false))}>
                  <Link2 size={13} /> Copy URL
                </button>
                <button className="is-danger" onClick={() => { onDelete(asset); setMenu(false) }}>
                  <Trash2 size={13} /> Delete asset
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="asset-card__foot">
          <Badge tone={asset.public ? 'success' : 'neutral'}>
            {asset.public ? <Globe2 size={10} /> : <LockKeyhole size={10} />}
            {asset.public ? 'Public' : 'Private'}
          </Badge>
          <span>{asset.kind}</span>
          <CopyButton value={asset.url} compact />
        </div>
      </div>
    </div>
  )
}

function UploadModal({ open, onClose }) {
  const { addAsset } = useStore()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('Image')
  const [isPublic, setIsPublic] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setName('')
    setKind('Image')
    setIsPublic(true)
    setDragging(false)
    setBusy(false)
  }

  const readFile = (nextFile) => {
    if (!nextFile) return
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(nextFile.type)) return
    setFile(nextFile)
    setKind(nextFile.type === 'image/gif' ? 'GIF' : 'Image')
    if (!name) setName(nextFile.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(nextFile))
  }

  const handleSubmit = async () => {
    if (!file) return
    setBusy(true)
    const uploaded = await addAsset(file, { name: name || file.name, kind, publicAsset: isPublic })
    setBusy(false)
    if (uploaded) {
      reset()
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Upload an asset"
      eyebrow="Local asset library"
      description="Images are stored in DATA_DIR/uploads and served by this Postique instance. Public assets get a direct URL you can use in email."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!file} loading={busy} icon={!busy && <Upload size={14} />}>
            Upload asset
          </Button>
        </>
      }
    >
      <div className="upload-form">
        <div
          className={cx('dropzone', dragging && 'is-dragging', preview && 'has-preview')}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            readFile(event.dataTransfer.files?.[0])
          }}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <>
              <img src={preview} alt="Asset preview" />
              <span className="dropzone__replace">Click to replace</span>
            </>
          ) : (
            <>
              <span className="dropzone__icon">
                <Upload size={20} />
              </span>
              <strong>Drop an image here, or click to browse</strong>
              <span>PNG, JPG, GIF or WebP · up to 10 MB</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(event) => readFile(event.target.files?.[0])}
          />
        </div>
        <div className="upload-fields">
          <Field label="Asset name">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Spring campaign banner" />
          </Field>
          <Field label="Type">
            <select className="select" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option>Image</option>
              <option>Logo</option>
              <option>Icons</option>
              <option>GIF</option>
            </select>
          </Field>
        </div>
        <div className="upload-public">
          <div>
            <strong>Public asset</strong>
            <span>Anyone with the URL can view it. Required for images used in email.</span>
          </div>
          <Toggle checked={isPublic} onChange={setIsPublic} label="Public asset" />
        </div>
        <div className="upload-note">
          <LockKeyhole size={13} />
          Private assets are served through signed URLs. Email clients cannot display them until you make them
          public or generate a long-lived signed link.
        </div>
      </div>
    </Modal>
  )
}

function AssetDetail({ asset, onClose }) {
  if (!asset) return null
  return (
    <Modal open={Boolean(asset)} onClose={onClose} title={asset.name} eyebrow="Asset detail" size="lg">
      <div className="asset-detail">
        <div className="asset-detail__image">
          <img src={asset.preview} alt={asset.name} />
        </div>
        <div className="asset-detail__side">
          <div className="asset-detail__row">
            <span>Type</span>
            <strong>{asset.kind}</strong>
          </div>
          <div className="asset-detail__row">
            <span>Dimensions</span>
            <strong>{asset.dimensions}</strong>
          </div>
          <div className="asset-detail__row">
            <span>File size</span>
            <strong>{asset.size}</strong>
          </div>
          <div className="asset-detail__row">
            <span>Visibility</span>
            <Badge tone={asset.public ? 'success' : 'neutral'}>{asset.public ? 'Public' : 'Private'}</Badge>
          </div>
          <div className="asset-detail__row">
            <span>Uploaded</span>
            <strong>{asset.uploaded}</strong>
          </div>
          <div className="asset-detail__url">
            <span>Direct URL</span>
            <code>{asset.url}</code>
            <CopyButton value={asset.url} label="Copy URL" />
          </div>
          <div className="asset-detail__snippet">
            <span>Use in MJML</span>
            <pre>{`<mj-image src="${asset.url}" alt="${asset.name}" />`}</pre>
            <CopyButton value={`<mj-image src="${asset.url}" alt="${asset.name}" />`} label="Copy MJML" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function Assets() {
  const { assets, deleteAsset, toast, config } = useStore()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const filtered = useMemo(() => {
    let list = assets
    if (filter !== 'all') list = list.filter((asset) => asset.kind === filter)
    if (search.trim()) list = list.filter((asset) => asset.name.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [assets, filter, search])

  const usedBytes = assets.reduce((total, asset) => total + (asset.bytes || 0), 0)
  const softQuota = 5 * 1024 ** 3
  const exampleAsset = assets.find((asset) => asset.public)
  const exampleUrl = exampleAsset?.url || `${config.appUrl}/media/assets/example.png`
  const exampleSnippet = `<img src="${exampleUrl}" alt="${exampleAsset?.name || 'Email asset'}" />`

  return (
    <div className="page page--assets">
      <PageHeader
        eyebrow="Local media"
        title="Assets"
        description="Keep the images, logos and GIFs your templates need in one place. Files live on this server and public assets get a direct URL."
        actions={
          <>
            <Badge tone="blue">Storage included</Badge>
            <Button onClick={() => setUploadOpen(true)} icon={<Upload size={15} />}>
              Upload asset
            </Button>
          </>
        }
      />

      <div className="asset-summary">
        <div className="storage-card">
          <div className="storage-card__top">
            <span className="storage-card__icon">
              <HardDrive size={18} />
            </span>
            <div>
              <span>Storage used</span>
              <strong>
                {formatBytes(usedBytes)} <small>on this server</small>
              </strong>
            </div>
            <Badge tone="neutral">Self-hosted</Badge>
          </div>
          <ProgressBar value={Math.min(100, (usedBytes / softQuota) * 100)} label="Storage used" />
          <div className="storage-card__foot">
            <span>{assets.length} assets · {assets.filter((asset) => asset.public).length} public</span>
            <button onClick={() => toast('Assets are stored under DATA_DIR/uploads', 'success')}>
              Storage path <ArrowRight size={11} />
            </button>
          </div>
        </div>
        <div className="asset-stat-card">
          <span>
            <Globe2 size={15} /> Direct URLs
          </span>
          <strong>{assets.filter((asset) => asset.public).length}</strong>
          <small>public assets</small>
        </div>
        <div className="asset-stat-card">
          <span>
            <HardDrive size={15} /> Local files
          </span>
          <strong>{formatBytes(usedBytes)}</strong>
          <small>served by Postique</small>
        </div>
        <div className="asset-stat-card">
          <span>
            <Image size={15} /> Assets
          </span>
          <strong>{assets.length}</strong>
          <small>{assets.filter((asset) => !asset.public).length} private</small>
        </div>
      </div>

      <div className="assets-toolbar">
        <div className="assets-filters">
          {filters.map((item) => {
            const count = item.id === 'all' ? assets.length : assets.filter((asset) => asset.kind === item.id).length
            return (
              <button key={item.id} className={cx(filter === item.id && 'is-active')} onClick={() => setFilter(item.id)}>
                {item.label}
                <span>{count}</span>
              </button>
            )
          })}
        </div>
        <div className="assets-search">
          <Search size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets…" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="assets-empty">
          <span>
            <FileImage size={24} />
          </span>
          <strong>No assets match</strong>
          <p>Try another search, or upload a new asset to get started.</p>
          <Button variant="secondary" onClick={() => setUploadOpen(true)} icon={<Plus size={14} />}>
            Upload asset
          </Button>
        </div>
      ) : (
        <div className="asset-grid">
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onOpen={setSelected}
              onDelete={(item) => {
                deleteAsset(item.id)
              }}
            />
          ))}
        </div>
      )}

      <div className="asset-cdn">
        <div className="asset-cdn__copy">
          <span className="asset-cdn__icon">
            <Code2 size={16} />
          </span>
          <div>
            <strong>Use an asset in your template</strong>
            <p>Every public asset has a stable URL. Reference it directly from MJML or raw HTML.</p>
          </div>
        </div>
        <div className="asset-cdn__code">
          <code>{exampleSnippet}</code>
          <CopyButton value={exampleSnippet} compact />
        </div>
        <div className="asset-cdn__note">
          <Info size={12} />
          Remote images may be blocked by some email clients until the recipient allows them. Always include
          alt text and a sensible fallback colour.
        </div>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <AssetDetail asset={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
