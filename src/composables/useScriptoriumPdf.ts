import { ref, onUnmounted } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// Pixel-unit styles for html2canvas rendering (A4 @ 96dpi = 794×1123px)
const RENDER_CSS = `
* { box-sizing: border-box; }
.phb-page { position:relative; width:794px; height:1123px; background:#F9F6EF; padding:60px 68px 53px; overflow:hidden; font-family:Georgia,'Times New Roman',serif; color:#1a1a1a; line-height:1.65; font-size:15px; }
.phb-border { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; opacity:.65; }
.phb-title-bar { font-family:'Cinzel',Georgia,serif; font-size:26px; font-weight:700; color:#F9F6EF; background:#1B3A4B; padding:9px 68px; margin:-60px -68px 28px; letter-spacing:.04em; line-height:1.25; }
h1 { font-family:'Cinzel',Georgia,serif; font-size:19px; font-weight:700; color:#F9F6EF; background:#1B3A4B; padding:5px 14px; margin:19px -5px 11px; }
h2 { font-family:'Cinzel',Georgia,serif; font-size:16px; font-weight:700; color:#1B3A4B; border-bottom:2px solid #1B3A4B; padding-bottom:3px; margin:16px 0 7px; }
h3 { font-family:'Cinzel',Georgia,serif; font-size:15px; font-weight:600; font-style:italic; color:#1B3A4B; margin:13px 0 4px; }
p { margin:0 0 7px; } ul,ol { padding-left:19px; margin:4px 0 7px; } li { margin:2px 0; }
blockquote { border-left:4px solid #1B3A4B; background:#E8F4F8; padding:8px 11px; margin:11px 0; border-radius:0 4px 4px 0; font-style:italic; }
blockquote p { margin:0; } strong { font-weight:700; } em { font-style:italic; }
code { background:#e4ddd0; padding:1px 4px; border-radius:2px; font-family:'Courier New',monospace; font-size:13px; }
pre { background:#1B3A4B; color:#E8F4F8; padding:11px; border-radius:4px; overflow:hidden; margin:11px 0; font-size:13px; }
pre code { background:transparent; padding:0; color:inherit; }
`

async function buildPdfBlob(pages: string[], title: string): Promise<Blob> {
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;'
  const styleEl = document.createElement('style')
  styleEl.textContent = RENDER_CSS
  holder.appendChild(styleEl)

  const pageEls: HTMLElement[] = []
  for (let i = 0; i < pages.length; i++) {
    const page = document.createElement('div')
    page.className = 'phb-page'

    const border = document.createElement('img')
    border.className = 'phb-border'
    border.src = '/assets/scriptorium/page-border.png'
    border.alt = ''
    page.appendChild(border)

    if (i === 0) {
      const bar = document.createElement('div')
      bar.className = 'phb-title-bar'
      bar.textContent = title || 'Untitled Document'
      page.appendChild(bar)
    }

    const body = document.createElement('div')
    body.innerHTML = pages[i]
    page.appendChild(body)

    holder.appendChild(page)
    pageEls.push(page)
  }

  document.body.appendChild(holder)
  await document.fonts.ready
  await Promise.all(
    Array.from(holder.querySelectorAll<HTMLImageElement>('img')).map(img =>
      img.complete ? Promise.resolve() : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() })
    )
  )

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title: title || 'Untitled Document' })
  for (let i = 0; i < pageEls.length; i++) {
    const canvas = await html2canvas(pageEls[i], { scale: 2, useCORS: true, logging: false, width: 794, height: 1123 })
    if (i > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
  }

  document.body.removeChild(holder)
  return pdf.output('blob') as Blob
}

export function useScriptoriumPdf(pages: ComputedRef<string[]>, title: Ref<string>) {
  const showPdfPreview = ref(false)
  const pdfBlobUrl = ref<string | null>(null)
  const isGeneratingPdf = ref(false)

  function closePdfPreview() {
    showPdfPreview.value = false
    if (pdfBlobUrl.value) { URL.revokeObjectURL(pdfBlobUrl.value); pdfBlobUrl.value = null }
  }

  function savePdf() {
    if (!pdfBlobUrl.value) return
    const a = document.createElement('a')
    a.href = pdfBlobUrl.value
    a.download = `${title.value || 'Untitled'}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function exportPdf() {
    isGeneratingPdf.value = true
    try {
      const blob = await buildPdfBlob(pages.value, title.value)
      const fileName = `${title.value || 'Untitled'}.pdf`
      // Use File instead of Blob — Chrome's PDF viewer uses the File name as the suggested download filename
      const file = new File([blob], fileName, { type: 'application/pdf' })
      if (pdfBlobUrl.value) URL.revokeObjectURL(pdfBlobUrl.value)
      pdfBlobUrl.value = URL.createObjectURL(file)
      showPdfPreview.value = true
    } finally {
      isGeneratingPdf.value = false
    }
  }

  onUnmounted(() => {
    if (pdfBlobUrl.value) URL.revokeObjectURL(pdfBlobUrl.value)
  })

  return { showPdfPreview, pdfBlobUrl, isGeneratingPdf, exportPdf, savePdf, closePdfPreview }
}
