import { useEffect, useState } from 'react';
import { Images } from 'lucide-react';
import { siteImageApi, apiUrl } from '../services/api.js';

function resolveUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = apiUrl('').replace(/\/api\/?$/, '');
  return `${apiBase}${url.startsWith('/') ? url : `/${url}`}`;
}

export default function SiteImagesAdmin({ embedded = false }) {
  const [images, setImages] = useState([]);
  const [sectionKey, setSectionKey] = useState('hero');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    const rows = await siteImageApi.list();
    setImages(rows);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message || 'Could not load website images.'))
      .finally(() => setLoading(false));
  }, []);

  async function onUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      await siteImageApi.upload(file, { sectionKey, title, altText: title });
      setTitle('');
      setNotice('Image uploaded and saved through the backend.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive(image) {
    setError('');
    try {
      await siteImageApi.update(image.id, { isActive: !image.isActive });
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not update image.');
    }
  }

  async function remove(image) {
    if (!window.confirm('Delete this website image?')) return;
    setError('');
    try {
      await siteImageApi.remove(image.id);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not delete image.');
    }
  }

  const body = (
    <>
      {error ? <p className="admin-error">{error}</p> : null}
      {notice ? <p className="admin-muted">{notice}</p> : null}

      <form className={`account-form-grid ${embedded ? '' : 'panel-card'}`} onSubmit={(event) => event.preventDefault()}>
        <label className="field">
          <span>Section</span>
          <select value={sectionKey} onChange={(event) => setSectionKey(event.target.value)}>
            <option value="hero">Hero carousel</option>
            <option value="landing">Landing</option>
            <option value="sidebar">Sidebar</option>
            <option value="quote">Quote panel</option>
            <option value="marketing">Marketing</option>
          </select>
        </label>
        <label className="field">
          <span>Title / alt text</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional label" />
        </label>
        <label className="field">
          <span>Image file</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onUpload} disabled={uploading} />
        </label>
      </form>

      <div className={embedded ? 'settings-site-images-list' : 'panel-card'}>
        {loading ? <p>Loading images...</p> : null}
        {!loading && !images.length ? <p className="admin-muted">No website images yet.</p> : null}
        <div className="admin-image-grid">
          {images.map((image) => (
            <article key={image.id} className="admin-image-card">
              <img src={resolveUrl(image.storageUrl)} alt={image.altText || image.title || 'Site image'} />
              <div>
                <strong>{image.sectionKey}</strong>
                <span>{image.title || 'Untitled'}</span>
                <small>{image.isActive ? 'Active' : 'Hidden'}</small>
              </div>
              <div className="admin-actions">
                <button type="button" onClick={() => toggleActive(image)}>{image.isActive ? 'Hide' : 'Show'}</button>
                <button type="button" onClick={() => remove(image)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="panel-card settings-card settings-site-images">
        <div className="settings-title">
          <Images size={18} />
          <div>
            <h3>Website images</h3>
            <span>Upload hero carousel and other site images</span>
          </div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <section className="account-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">ADMINISTRATION</span>
          <h1>Website images</h1>
          <p>Upload and manage hero carousel and other site images. Files are stored by the backend; metadata is saved in the database.</p>
        </div>
      </div>
      {body}
    </section>
  );
}
