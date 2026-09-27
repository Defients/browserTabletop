import { useState } from 'react';
import { builtInTemplates, exportTemplate, importTemplate, validateTemplate, type TableTemplate } from '../../packages/templates/index.js';
import { download, loadLocal, navigate, saveLocal } from './common.js';
import TemplateEditor from './TemplateEditor.js';

const KEY = 'tabletop.templates';
/** Custom templates live only in this browser until exported or used for a room (which pins a copy). */
export function customTemplates(): TableTemplate[] {
  return loadLocal<unknown[]>(KEY, []).flatMap(t => { try { return [validateTemplate(t)]; } catch { return []; } });
}
export function saveCustomTemplate(t: TableTemplate) { saveLocal(KEY, [...customTemplates().filter(x => x.id !== t.id), t]); }
export function allTemplates(): TableTemplate[] { return [...builtInTemplates, ...customTemplates()]; }
export const findTemplate = (id: string | undefined) => allTemplates().find(t => t.id === id);

export function TemplateLibrary({ editId }: { editId?: string }) {
  const [custom, setCustom] = useState(customTemplates);
  const [error, setError] = useState('');
  const newId = () => `custom-${crypto.randomUUID()}`;

  if (editId) {
    const base = editId === 'new' ? { ...structuredClone(builtInTemplates.find(t => t.id === 'blank')!), id: newId(), title: 'My table' }
      : editId.startsWith('copy-') ? (() => { const src = findTemplate(editId.slice(5)); return src ? { ...structuredClone(src), id: newId(), title: `${src.title} (copy)` } : undefined; })()
      : custom.find(t => t.id === editId);
    if (!base) return <section className="page narrow"><h1>Template not found</h1><a href="#/templates">Back to the library</a></section>;
    return (
      <section className="page page-wide">
        <h1 className="sr-only">Template editor</h1>
        <div className="page-head"><h2>Editing “{base.title}”</h2><p className="muted">Changes affect new tables only. Existing rooms keep the copy they were created with.</p></div>
        <TemplateEditor template={base} onCancel={() => navigate('#/templates')} onSave={t => { saveCustomTemplate(t); setCustom(customTemplates()); navigate('#/templates'); }} />
      </section>
    );
  }
  const remove = (id: string) => { saveLocal(KEY, custom.filter(t => t.id !== id)); setCustom(customTemplates()); };
  const card = (t: TableTemplate, mine: boolean) => (
    <li key={t.id} className="template-card">
      <div><h3>{t.title}</h3><p className="muted small">{t.description}</p><p className="small">{t.seats} seats · {t.cards.length} cards · {t.profile === 'free' ? 'Free table' : t.profile === 'intrilex-core' ? 'Manual Core sandbox' : 'Rules-assisted First Contact'}</p></div>
      <div className="button-row">
        <a className="button-like" href={`#/create?template=${encodeURIComponent(t.id)}`} onClick={e => { e.preventDefault(); sessionStorage.setItem('tabletop.createTemplate', t.id); navigate('#/create'); }}>Start online table</a>
        {t.profile !== 'intrilex-first-contact' && <a className="button-like" href={`#/practice/table/${encodeURIComponent(t.id)}`}>Practise locally</a>}
        {t.profile !== 'intrilex-first-contact' && <a className="button-like" href={`#/templates/copy-${encodeURIComponent(t.id)}`}>Duplicate & edit</a>}
        {mine && <a className="button-like" href={`#/templates/${encodeURIComponent(t.id)}`}>Edit</a>}
        <button type="button" onClick={() => download(`${t.id}.tabletop.json`, exportTemplate(t))}>Export</button>
        {mine && <button type="button" className="danger" onClick={() => remove(t.id)}>Delete</button>}
      </div>
    </li>
  );
  return (
    <section className="page">
      <div className="page-head"><h1>Template library</h1><p className="muted">Templates are declarative data files (<code>.tabletop.json</code>). They can include custom PNG, JPEG or WebP card faces, but never code, links or live game state.</p></div>
      <div className="button-row">
        <a className="button-like primary" href="#/templates/new">New template</a>
        <label className="button-like">Import template file<input type="file" accept="application/json,.json" className="sr-only" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const t = importTemplate(await f.text()); saveCustomTemplate(t); setCustom(customTemplates()); setError(''); } catch (err) { setError((err as Error).message); } e.target.value = ''; }} /></label>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <h2>Your templates</h2>
      {custom.length ? <ul className="template-grid">{custom.map(t => card(t, true))}</ul> : <p className="empty-note">No custom templates yet. Duplicate a built-in one or start from a blank table.</p>}
      <h2>Built-in templates</h2>
      <ul className="template-grid">{builtInTemplates.map(t => card(t, false))}</ul>
    </section>
  );
}
