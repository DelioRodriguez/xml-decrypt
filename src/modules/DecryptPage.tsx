import {useRef, useState} from 'react'

function Icon({name, size = 22}: { name: 'lock' | 'upload' | 'file' | 'arrow' | 'download' | 'check'; size?: number }) {
    const paths = {
        lock: <>
            <rect x="5" y="10" width="14" height="11" rx="3"/>
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>
        </>,
        upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>,
        file: <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/>
        </>,
        arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
        download: <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>,
        check: <path d="m5 12 4 4L19 6"/>,
    }
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function readResult(text: string, contentType: string): { text: string; xml: boolean } {
    if (text.trim().startsWith('<')) return {text, xml: true}
    if (contentType.includes('json')) {
        const data: unknown = JSON.parse(text)
        const findXml = (value: unknown, depth = 0): string | undefined => {
            if (typeof value === 'string' && value.trim().startsWith('<')) return value
            if (value && typeof value === 'object' && depth < 4) {
                for (const item of Object.values(value)) {
                    const xml = findXml(item, depth + 1)
                    if (xml) return xml
                }
            }
        }
        const xml = findXml(data)
        return {text: xml ?? JSON.stringify(data, null, 2), xml: Boolean(xml)}
    }
    return {text, xml: false}
}

export default function DecryptPage() {
    const input = useRef<HTMLInputElement>(null)
    const [file, setFile] = useState<File | null>(null)
    const [dragging, setDragging] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [result, setResult] = useState<ReturnType<typeof readResult> | null>(null)
    const [copied, setCopied] = useState(false)

    function selectFile(next?: File) {
        setError('');
        setResult(null);
        setCopied(false);
        setFile(null)
        if (!next) return
        if (!next.name.toLowerCase().endsWith('.enc')) {
            setError('Selecciona un archivo con extensión .enc.');
            return
        }
        if (!next.size) {
            setError('El archivo está vacío. Selecciona otro archivo .enc.');
            return
        }
        if (next.size > 10 * 1024 * 1024) {
            setError('El archivo supera el límite de 10 MB.');
            return
        }
        setFile(next)
    }

    async function decrypt() {
        if (!file || busy) return
        setBusy(true);
        setError('');
        setResult(null);
        setCopied(false)
        try {
            const body = new FormData()
            body.append('file', file)
            const response = await fetch('/api/decrypt', {method: 'POST', body, signal: AbortSignal.timeout(95000)})
            const text = await response.text()
            if (!response.ok) {
                let message = `El servicio respondió con un error (${response.status}).`
                try {
                    const data = JSON.parse(text)
                    if (typeof data.message === 'string') message = data.message
                    else if (typeof data.detail === 'string') message = data.detail
                    else if (typeof data.error === 'string') message = data.error
                } catch { /* Non-JSON error response. */
                }
                throw new Error(message)
            }
            if (!text.trim()) throw new Error('El servicio devolvió una respuesta vacía.')
            setResult(readResult(text, response.headers.get('content-type') ?? ''))
        } catch (cause) {
            setError(cause instanceof Error && cause.name === 'TimeoutError'
                ? 'El servicio tardó demasiado. Vuelve a intentarlo.'
                : cause instanceof TypeError ? 'No se pudo conectar con el servidor. Verifica tu conexión.'
                    : cause instanceof Error ? cause.message : 'No se pudo desencriptar el archivo.')
        } finally {
            setBusy(false)
        }
    }

    function download() {
        if (!result || !file) return
        const url = URL.createObjectURL(new Blob([result.text], {type: result.xml ? 'application/xml' : 'text/plain'}))
        const link = document.createElement('a')
        link.href = url
        link.download = `${file.name.replace(/\.enc$/i, '')}_desencriptado.${result.xml ? 'xml' : 'txt'}`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(result?.text ?? '');
            setCopied(true)
        } catch {
            setError('No se pudo copiar. Puedes descargar el archivo o seleccionar el texto.')
        }
    }

    return <div className="app-shell">
        <header className="topbar">
            <a className="brand" href="/" aria-label="XML ENCRIPT, inicio"><span className="brand-symbol"><Icon
                name="lock"/></span><span>XML <span className="brand-accent">ENCRIPT</span></span></a>
            <span className="header-label">Herramientas de nómina <span className="divider"/><span
                className="version">v1.0</span></span>
        </header>
        <main className="workspace">
            <div className="intro"><span className="eyebrow"><span/> UTILIDAD XML</span><h1>Tu XML, <span>de vuelta en claro.</span>
            </h1><p>Desencripta tus archivos de nómina y recupera su contenido<br className="desktop-break"/> en unos
                pocos pasos.</p></div>
            <div className="tool-grid">
                <section className="panel upload-panel" aria-labelledby="upload-title" aria-busy={busy}>
                    <div className="panel-heading"><span className="step-number">01</span>
                        <div><h2 id="upload-title">Carga tu archivo</h2><p>Selecciona el XML que quieres
                            desencriptar.</p></div>
                    </div>
                    <input ref={input} type="file" accept=".enc" className="sr-only"
                           disabled={busy} onChange={event => {
                        selectFile(event.target.files?.[0]);
                        event.target.value = ''
                    }} aria-label="Seleccionar archivo encriptado .enc"/>
                    <button className={`dropzone ${dragging ? 'dragging' : ''}`} disabled={busy}
                            onClick={() => input.current?.click()} onDragOver={event => {
                        event.preventDefault();
                        if (!busy) setDragging(true)
                    }} onDragLeave={() => setDragging(false)} onDrop={event => {
                        event.preventDefault();
                        setDragging(false);
                        if (!busy) {
                            if (event.dataTransfer.files.length !== 1) {
                                setError('Carga un solo archivo .enc a la vez.');
                                return
                            }
                            selectFile(event.dataTransfer.files[0])
                        }
                    }}>
                        <span className="upload-icon"><Icon name={file ? 'file' : 'upload'} size={30}/></span>
                        <strong>{file ? file.name : 'Arrastra tu archivo .enc aquí'}</strong>
                        <span>{file ? `${(file.size / 1024).toFixed(1)} KB · Listo para desencriptar` : 'o haz clic para explorar tus archivos'}</span>
                        <span
                            className="file-type">{file ? 'Cambiar archivo' : 'Solo archivos .enc · Hasta 10 MB'}</span>
                    </button>
                    <div className="privacy-note"><Icon name="lock" size={16}/><span>Tu archivo se envía al servicio para desencriptarlo.</span>
                    </div>
                    <button className="primary-button" onClick={decrypt} disabled={!file || busy}>{busy ? <><span
                        className="spinner"/> Desencriptando…</> : <>Desencriptar archivo <Icon name="arrow"
                                                                                                size={19}/></>}</button>
                    {error && <div className="error-message" role="alert">{error}</div>}
                    <p className="upload-caption">El archivo original permanece en tu equipo.</p>
                </section>
                <section className="panel result-panel" aria-labelledby="result-title">
                    <div className="panel-heading"><span className={`step-number ${result ? 'complete' : ''}`}>{result ?
                        <Icon name="check" size={17}/> : '02'}</span>
                        <div><h2 id="result-title">Resultado</h2>
                            <p>{result ? 'La respuesta del servicio está lista.' : 'Tu contenido desencriptado aparecerá aquí.'}</p>
                        </div>
                        {result && <span className="ready-badge">Listo</span>}</div>
                    {result ? <div className="result-content">
                        <div className="code-heading">
                            <span>{result.xml ? 'XML DESENCRIPTADO' : 'RESPUESTA DEL SERVICIO'}</span>
                            <button onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
                        </div>
                        <pre tabIndex={0}>{result.text}</pre>
                        <button className="download-button" onClick={download}><Icon name="download"
                                                                                     size={18}/> Descargar {result.xml ? 'XML' : 'respuesta'}
                        </button>
                    </div> : <div className="empty-result" role="status">
                        <div className={`document-art ${busy ? 'processing' : ''}`}><span
                            className="document-fold"/><span className="code-mark">&lt;/&gt;</span><span
                            className="document-line"/><span className="document-line short"/><span
                            className="document-lock"><Icon name="lock" size={17}/></span></div>
                        <h3>{busy ? 'Procesando tu archivo' : 'Todo empieza con un archivo'}</h3>
                        <p>{busy ? 'Estamos esperando la respuesta del servicio.' : 'Carga un archivo .enc y haz clic en'}{!busy && <>
                            <br/><strong>Desencriptar archivo</strong> para ver el resultado.</>}</p><span
                        className="waiting-label"><span
                        className={busy ? 'active-dot' : ''}/>{busy ? 'Desencriptación en curso' : 'En espera de un archivo'}</span>
                    </div>}
                    <div className="result-footer"><Icon name="file" size={16}/><span>Visualiza el contenido y descarga el resultado.</span>
                    </div>
                </section>
            </div>
            <section className="how-it-works" aria-label="Cómo funciona"><span
                className="how-label">ASÍ DE SIMPLE</span>
                <div><span>1</span> Selecciona tu .enc</div>
                <span className="flow-line"/>
                <div><span>2</span> Desencripta el archivo</div>
                <span className="flow-line"/>
                <div><span>3</span> Descarga el resultado</div>
            </section>
        </main>
        <footer className="page-footer"><span>© {new Date().getFullYear()} XML ENCRIPT</span><span>Una herramienta para simplificar tu trabajo.</span><span
            className="footer-secure"><Icon name="lock" size={14}/> Conexión al servicio por HTTPS</span></footer>
    </div>
}
